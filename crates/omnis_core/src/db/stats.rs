use std::collections::HashMap;
use chrono::{Datelike, Utc};
use rusqlite::params;
use uuid::Uuid;

use omnis_sdk::{
    BacklogSummaryDto, CategoryShareDto, DayActivityDto, GameStatsDto, GlobalStatsDto,
    WeekPlaytimeDto,
};
use crate::db::{Database, DatabaseError};

/// Helper to parse genres whether stored as JSON array `["Action", "RPG"]` or comma-separated string `"Action, RPG"`
fn parse_genres_field(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(trimmed) {
            let res: Vec<String> = list
                .into_iter()
                .map(|g| g.trim().to_string())
                .filter(|g| !g.is_empty())
                .collect();
            if !res.is_empty() {
                return res;
            }
        }
    }

    trimmed
        .split(',')
        .map(|g| g.trim().trim_matches('"').trim_matches('\'').trim().to_string())
        .filter(|g| !g.is_empty())
        .collect()
}

/// Repository trait for aggregating library and play session analytics
pub trait StatsRepository: Send + Sync {
    /// Retrieve aggregated global statistics for the given year (or current UTC year if None)
    fn get_global_statistics(&self, year: Option<i32>) -> Result<GlobalStatsDto, DatabaseError>;

    /// Retrieve detailed session analytics and 4-week bar chart for a single game
    fn get_game_statistics(&self, game_id: Uuid) -> Result<GameStatsDto, DatabaseError>;
}

impl StatsRepository for Database {
    fn get_global_statistics(&self, year: Option<i32>) -> Result<GlobalStatsDto, DatabaseError> {
        let conn = self.reader();
        let target_year = year.unwrap_or_else(|| Utc::now().year());
        let year_str = format!("{:04}", target_year);

        // 1. Total playtime in year: sum of duration_seconds of sessions in that year
        let mut total_playtime_year_seconds: u64 = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_seconds), 0) FROM game_sessions WHERE strftime('%Y', started_at) = ?1",
                params![year_str],
                |row| row.get::<_, i64>(0),
            )?
            .max(0) as u64;

        if total_playtime_year_seconds == 0 {
            // Fallback for imported games with last_activity in this year but without granular session history
            let fallback_playtime: i64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(playtime_seconds), 0) FROM games WHERE strftime('%Y', last_activity) = ?1",
                    params![year_str],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            if fallback_playtime > 0 {
                total_playtime_year_seconds = fallback_playtime.max(0) as u64;
            }
        }

        // 2. Activity heatmap: group by strftime('%Y-%m-%d', started_at) where strftime('%Y', started_at) = ?1
        // and sum duration_seconds, count sessions. Order by date ASC.
        let mut heatmap_stmt = conn.prepare(
            "
            SELECT
                strftime('%Y-%m-%d', started_at) AS day,
                COUNT(*) AS count_sessions,
                COALESCE(SUM(duration_seconds), 0) AS duration_seconds
            FROM game_sessions
            WHERE strftime('%Y', started_at) = ?1
            GROUP BY day
            HAVING day IS NOT NULL
            ORDER BY day ASC
            ",
        )?;

        let activity_heatmap = heatmap_stmt
            .query_map(params![year_str], |row| {
                let date: String = row.get(0)?;
                let count_sessions: u32 = row.get::<_, i64>(1)?.max(0) as u32;
                let duration_seconds: u64 = row.get::<_, i64>(2)?.max(0) as u64;
                Ok(DayActivityDto {
                    date,
                    count_sessions,
                    duration_seconds,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // 3. Store distribution: aggregate playtime_seconds grouped by library_id and calculate percentage
        let mut store_stmt = conn.prepare(
            "
            SELECT
                library_id,
                COALESCE(SUM(playtime_seconds), 0) AS total_playtime
            FROM games
            GROUP BY library_id
            ORDER BY total_playtime DESC, library_id ASC
            ",
        )?;

        let store_rows = store_stmt
            .query_map([], |row| {
                let name: String = row.get(0)?;
                let duration: i64 = row.get(1)?;
                Ok((name, duration.max(0) as u64))
            })?
            .collect::<Result<Vec<(String, u64)>, _>>()?;

        let total_store_playtime: u64 = store_rows.iter().map(|(_, dur)| *dur).sum();
        let store_distribution: Vec<CategoryShareDto> = store_rows
            .into_iter()
            .filter(|(_, dur)| if total_store_playtime > 0 { *dur > 0 } else { true })
            .map(|(name, duration_seconds)| {
                let percentage = if total_store_playtime > 0 {
                    ((duration_seconds as f64 / total_store_playtime as f64) * 100.0) as f32
                } else {
                    0.0
                };
                CategoryShareDto {
                    name,
                    duration_seconds,
                    percentage,
                }
            })
            .collect();

        // 4. Genre distribution: query genres and playtime_seconds from games.
        // Parse genres (comma-separated or JSON list or array strings), accumulate playtime per genre, then compute percentages.
        let mut genre_stmt = conn.prepare(
            "
            SELECT genres, playtime_seconds
            FROM games
            WHERE genres IS NOT NULL AND TRIM(genres) != ''
            ",
        )?;

        let mut genre_playtimes: HashMap<String, u64> = HashMap::new();
        let genre_rows = genre_stmt.query_map([], |row| {
            let genres_raw: String = row.get(0)?;
            let playtime: i64 = row.get(1)?;
            Ok((genres_raw, playtime.max(0) as u64))
        })?;

        for row_res in genre_rows {
            let (genres_raw, playtime) = row_res?;
            let parsed_genres = parse_genres_field(&genres_raw);
            for g in parsed_genres {
                *genre_playtimes.entry(g).or_insert(0) += playtime;
            }
        }

        let total_genre_playtime: u64 = genre_playtimes.values().sum();
        let mut genre_distribution: Vec<CategoryShareDto> = genre_playtimes
            .into_iter()
            .filter(|(_, dur)| if total_genre_playtime > 0 { *dur > 0 } else { true })
            .map(|(name, duration_seconds)| {
                let percentage = if total_genre_playtime > 0 {
                    ((duration_seconds as f64 / total_genre_playtime as f64) * 100.0) as f32
                } else {
                    0.0
                };
                CategoryShareDto {
                    name,
                    duration_seconds,
                    percentage,
                }
            })
            .collect();

        genre_distribution.sort_by(|a, b| {
            b.duration_seconds
                .cmp(&a.duration_seconds)
                .then_with(|| a.name.cmp(&b.name))
        });

        // 5. Backlog summary: count games by completion_status (NotPlayed vs Beaten/Completed/Played/InProgress)
        // and compute percentage (beaten + completed) / total * 100
        let (total_games, completed_count, in_progress_count): (i64, i64, i64) = conn.query_row(
            "
            SELECT
                COUNT(*),
                COALESCE(SUM(CASE
                    WHEN LOWER(REPLACE(REPLACE(REPLACE(COALESCE(completion_status, ''), ' ', ''), '_', ''), '-', '')) IN ('completed', 'beaten') THEN 1
                    ELSE 0
                END), 0),
                COALESCE(SUM(CASE
                    WHEN LOWER(REPLACE(REPLACE(REPLACE(COALESCE(completion_status, ''), ' ', ''), '_', ''), '-', '')) IN ('playing', 'inprogress', 'played') THEN 1
                    ELSE 0
                END), 0)
            FROM games
            ",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        let total_games_u32 = total_games.max(0) as u32;
        let completed_count_u32 = completed_count.max(0) as u32;
        let in_progress_count_u32 = in_progress_count.max(0) as u32;
        let not_played_count_u32 = total_games_u32
            .saturating_sub(completed_count_u32 + in_progress_count_u32);

        let completion_percentage = if total_games_u32 > 0 {
            ((completed_count_u32 as f64 / total_games_u32 as f64) * 100.0) as f32
        } else {
            0.0
        };

        let backlog_summary = BacklogSummaryDto {
            not_played_count: not_played_count_u32,
            in_progress_count: in_progress_count_u32,
            completed_count: completed_count_u32,
            total_games: total_games_u32,
            completion_percentage,
        };

        Ok(GlobalStatsDto {
            total_playtime_year_seconds,
            activity_heatmap,
            store_distribution,
            genre_distribution,
            backlog_summary,
        })
    }

    fn get_game_statistics(&self, game_id: Uuid) -> Result<GameStatsDto, DatabaseError> {
        let conn = self.reader();
        let game_id_str = game_id.to_string();

        // 1. Average session duration and longest session:
        // SELECT COALESCE(AVG(duration_seconds), 0), COALESCE(MAX(duration_seconds), 0) FROM game_sessions WHERE game_id = ?1
        let (avg_session, max_session): (f64, i64) = conn.query_row(
            "
            SELECT
                COALESCE(AVG(duration_seconds), 0.0),
                COALESCE(MAX(duration_seconds), 0)
            FROM game_sessions
            WHERE game_id = ?1
            ",
            params![game_id_str],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let average_session_seconds = if avg_session.is_finite() && avg_session > 0.0 {
            avg_session.round() as u64
        } else {
            0
        };
        let longest_session_seconds = max_session.max(0) as u64;

        // 2. 4-week bar chart: calculate the 4 weeks ending today (7-day intervals).
        // Query sessions in each week window and sum duration_seconds.
        let today = Utc::now().date_naive();
        let mut last_4_weeks_bars = Vec::with_capacity(4);

        for w in 0..4 {
            let week_label = format!("Settimana {}", w + 1);
            let start_offset = (4 - w) * 7;
            let end_offset = (3 - w) * 7;
            let start_date = today - chrono::Duration::days(start_offset as i64);
            let end_date = today - chrono::Duration::days(end_offset as i64);

            let start_str = start_date.format("%Y-%m-%d").to_string();
            let end_str = end_date.format("%Y-%m-%d").to_string();

            let duration_seconds: u64 = if w == 3 {
                conn.query_row(
                    "
                    SELECT COALESCE(SUM(duration_seconds), 0)
                    FROM game_sessions
                    WHERE game_id = ?1
                      AND strftime('%Y-%m-%d', started_at) >= ?2
                      AND strftime('%Y-%m-%d', started_at) <= ?3
                    ",
                    params![game_id_str, start_str, end_str],
                    |row| row.get::<_, i64>(0),
                )?
                .max(0) as u64
            } else {
                conn.query_row(
                    "
                    SELECT COALESCE(SUM(duration_seconds), 0)
                    FROM game_sessions
                    WHERE game_id = ?1
                      AND strftime('%Y-%m-%d', started_at) >= ?2
                      AND strftime('%Y-%m-%d', started_at) < ?3
                    ",
                    params![game_id_str, start_str, end_str],
                    |row| row.get::<_, i64>(0),
                )?
                .max(0) as u64
            };

            last_4_weeks_bars.push(WeekPlaytimeDto {
                week_label,
                start_date: start_str,
                end_date: end_str,
                duration_seconds,
            });
        }

        Ok(GameStatsDto {
            average_session_seconds,
            longest_session_seconds,
            last_4_weeks_bars,
        })
    }
}

impl Database {
    #[inline]
    pub fn get_global_statistics(
        &self,
        year: Option<i32>,
    ) -> Result<GlobalStatsDto, DatabaseError> {
        StatsRepository::get_global_statistics(self, year)
    }

    #[inline]
    pub fn get_game_statistics(&self, game_id: Uuid) -> Result<GameStatsDto, DatabaseError> {
        StatsRepository::get_game_statistics(self, game_id)
    }
}

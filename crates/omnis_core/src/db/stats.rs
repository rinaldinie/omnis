use chrono::{DateTime, Datelike, NaiveDate, Utc};
use rusqlite::params;
use std::collections::{BTreeMap, HashMap};
use uuid::Uuid;

use crate::db::{parse_and_normalize_genres, Database, DatabaseError};
use omnis_sdk::{
    BacklogSummaryDto, CategoryShareDto, DayActivityDto, DaySessionDto, GameStatsDto,
    GlobalStatsDto, WeekPlaytimeDto,
};

fn parse_utc_datetime(raw: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

// ---------------------------------------------------------------------------
// Focused Query Helpers for Global Statistics
// ---------------------------------------------------------------------------

fn query_lifetime_playtime(conn: &rusqlite::Connection) -> Result<u64, DatabaseError> {
    let total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(playtime_seconds), 0) FROM games",
        [],
        |row| row.get(0),
    )?;
    Ok(total.max(0) as u64)
}

fn query_available_years(
    conn: &rusqlite::Connection,
    target_year: i32,
) -> Result<Vec<i32>, DatabaseError> {
    let mut years_set = std::collections::BTreeSet::new();
    years_set.insert(target_year);
    years_set.insert(Utc::now().year());

    if let Ok(mut year_stmt) = conn.prepare(
        "SELECT DISTINCT CAST(substr(started_at, 1, 4) AS INTEGER) FROM game_sessions WHERE started_at IS NOT NULL
         UNION
         SELECT DISTINCT CAST(substr(last_activity, 1, 4) AS INTEGER) FROM games WHERE last_activity IS NOT NULL;"
    ) {
        if let Ok(year_rows) = year_stmt.query_map([], |row| row.get::<_, Option<i32>>(0)) {
            for yr in year_rows.flatten().flatten() {
                if (1990..=2100).contains(&yr) {
                    years_set.insert(yr);
                }
            }
        }
    }
    let mut available_years: Vec<i32> = years_set.into_iter().collect();
    available_years.sort_by(|a, b| b.cmp(a));
    Ok(available_years)
}

fn query_year_playtime_fallback(
    conn: &rusqlite::Connection,
    target_year: i32,
) -> Result<u64, DatabaseError> {
    let year_start = format!("{:04}-01-01", target_year);
    let next_year_start = format!("{:04}-01-01", target_year + 1);
    let fallback_playtime: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(playtime_seconds), 0)
             FROM games
             WHERE last_activity >= ?1 AND last_activity < ?2",
            params![year_start, next_year_start],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(fallback_playtime.max(0) as u64)
}

fn query_activity_heatmap(
    conn: &rusqlite::Connection,
    target_year: i32,
) -> Result<Vec<DayActivityDto>, DatabaseError> {
    // Include +/- 1 day margin in the index range scan to preserve exact UTC bucketing for any timezone offset
    let range_start = format!("{:04}-12-31", target_year - 1);
    let range_end = format!("{:04}-01-02", target_year + 1);

    let mut session_stmt = conn.prepare(
        "
        SELECT
            s.id,
            s.game_id,
            COALESCE(g.title, 'Unknown Game') AS game_title,
            g.library_id,
            g.cover_image_path AS cover_image,
            s.started_at,
            s.ended_at,
            s.duration_seconds
        FROM game_sessions s
        LEFT JOIN games g ON s.game_id = g.id
        WHERE s.started_at >= ?1 AND s.started_at < ?2
        ORDER BY s.started_at ASC
        ",
    )?;

    let mut by_day: BTreeMap<String, DayActivityDto> = BTreeMap::new();

    let session_rows = session_stmt.query_map(params![range_start, range_end], |row| {
        let id: String = row.get(0)?;
        let game_id: String = row.get(1)?;
        let game_title: String = row.get(2)?;
        let library_id: Option<String> = row.get(3)?;
        let cover_image: Option<String> = row.get(4)?;
        let started_at: String = row.get(5)?;
        let ended_at: String = row.get(6)?;
        let duration_seconds: u64 = row.get::<_, i64>(7)?.max(0) as u64;

        Ok(DaySessionDto {
            id,
            game_id,
            game_title,
            library_id,
            cover_image,
            started_at,
            ended_at,
            duration_seconds,
        })
    })?;

    for item in session_rows {
        let session = item?;
        let Some(dt_utc) = parse_utc_datetime(&session.started_at) else {
            continue;
        };
        if dt_utc.year() != target_year {
            continue;
        }
        let day = dt_utc.format("%Y-%m-%d").to_string();
        let entry = by_day.entry(day.clone()).or_insert_with(|| DayActivityDto {
            date: day,
            count_sessions: 0,
            duration_seconds: 0,
            sessions: Vec::new(),
        });
        entry.count_sessions += 1;
        entry.duration_seconds += session.duration_seconds;
        entry.sessions.push(session);
    }

    Ok(by_day.into_values().collect())
}

pub fn query_day_sessions(
    conn: &rusqlite::Connection,
    date_str: &str,
) -> Result<Vec<DaySessionDto>, DatabaseError> {
    let target_date = NaiveDate::parse_from_str(date_str.trim(), "%Y-%m-%d").ok();
    let (range_start, range_end) = match target_date {
        Some(d) => {
            let prev = d - chrono::Duration::days(1);
            let next = d + chrono::Duration::days(2);
            (
                prev.format("%Y-%m-%d").to_string(),
                next.format("%Y-%m-%d").to_string(),
            )
        }
        None => return Ok(Vec::new()),
    };

    let mut stmt = conn.prepare(
        "
        SELECT
            s.id,
            s.game_id,
            COALESCE(g.title, 'Unknown Game') AS game_title,
            g.library_id,
            g.cover_image_path AS cover_image,
            s.started_at,
            s.ended_at,
            s.duration_seconds
        FROM game_sessions s
        LEFT JOIN games g ON s.game_id = g.id
        WHERE s.started_at >= ?1 AND s.started_at < ?2
        ORDER BY s.started_at ASC
        ",
    )?;

    let rows = stmt.query_map(params![range_start, range_end], |row| {
        let id: String = row.get(0)?;
        let game_id: String = row.get(1)?;
        let game_title: String = row.get(2)?;
        let library_id: Option<String> = row.get(3)?;
        let cover_image: Option<String> = row.get(4)?;
        let started_at: String = row.get(5)?;
        let ended_at: String = row.get(6)?;
        let duration_seconds: u64 = row.get::<_, i64>(7)?.max(0) as u64;

        Ok(DaySessionDto {
            id,
            game_id,
            game_title,
            library_id,
            cover_image,
            started_at,
            ended_at,
            duration_seconds,
        })
    })?;

    let mut sessions = Vec::new();
    for item in rows {
        let session = item?;
        if let (Some(target), Some(dt_utc)) = (target_date, parse_utc_datetime(&session.started_at)) {
            if dt_utc.date_naive() == target {
                sessions.push(session);
            }
        }
    }
    Ok(sessions)
}

fn query_store_distribution(
    conn: &rusqlite::Connection,
) -> Result<Vec<CategoryShareDto>, DatabaseError> {
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
        .filter(|(_, dur)| {
            if total_store_playtime > 0 {
                *dur > 0
            } else {
                true
            }
        })
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

    Ok(store_distribution)
}

fn query_genre_distribution(
    conn: &rusqlite::Connection,
) -> Result<Vec<CategoryShareDto>, DatabaseError> {
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
        let parsed_genres = parse_and_normalize_genres(&genres_raw);
        for g in parsed_genres {
            *genre_playtimes.entry(g).or_insert(0) += playtime;
        }
    }

    let total_genre_playtime: u64 = genre_playtimes.values().sum();
    let mut genre_distribution: Vec<CategoryShareDto> = genre_playtimes
        .into_iter()
        .filter(|(_, dur)| {
            if total_genre_playtime > 0 {
                *dur > 0
            } else {
                true
            }
        })
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

    Ok(genre_distribution)
}

fn query_backlog_summary(conn: &rusqlite::Connection) -> Result<BacklogSummaryDto, DatabaseError> {
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
                WHEN (completion_status IS NULL OR LOWER(TRIM(completion_status)) = 'notplayed') AND playtime_seconds > 0 THEN 1
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
    let not_played_count_u32 =
        total_games_u32.saturating_sub(completed_count_u32 + in_progress_count_u32);

    let completion_percentage = if total_games_u32 > 0 {
        ((completed_count_u32 as f64 / total_games_u32 as f64) * 100.0) as f32
    } else {
        0.0
    };

    Ok(BacklogSummaryDto {
        not_played_count: not_played_count_u32,
        in_progress_count: in_progress_count_u32,
        completed_count: completed_count_u32,
        total_games: total_games_u32,
        completion_percentage,
    })
}

// ---------------------------------------------------------------------------
// Focused Query Helpers for Game Statistics
// ---------------------------------------------------------------------------

fn query_game_session_metrics(
    conn: &rusqlite::Connection,
    game_id_str: &str,
) -> Result<(u64, u64), DatabaseError> {
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

    Ok((average_session_seconds, longest_session_seconds))
}

fn compute_weekly_buckets(
    conn: &rusqlite::Connection,
    game_id_str: &str,
    today: chrono::NaiveDate,
) -> Result<Vec<WeekPlaytimeDto>, DatabaseError> {
    let mut buckets: Vec<(NaiveDate, NaiveDate, bool, u64)> = Vec::with_capacity(4);
    for w in 0..4 {
        let start_offset = (4 - w) * 7;
        let end_offset = (3 - w) * 7;
        let start_date = today - chrono::Duration::days(start_offset as i64);
        let end_date = today - chrono::Duration::days(end_offset as i64);
        buckets.push((start_date, end_date, w == 3, 0));
    }

    let range_start = (today - chrono::Duration::days(29))
        .format("%Y-%m-%d")
        .to_string();
    let range_end = (today + chrono::Duration::days(2))
        .format("%Y-%m-%d")
        .to_string();

    let mut stmt = conn.prepare(
        "
        SELECT started_at, duration_seconds
        FROM game_sessions
        WHERE game_id = ?1
          AND started_at >= ?2
          AND started_at < ?3
        ",
    )?;
    let rows = stmt.query_map(params![game_id_str, range_start, range_end], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?.max(0) as u64))
    })?;

    for row in rows {
        let (started_at, dur) = row?;
        let Some(dt_utc) = parse_utc_datetime(&started_at) else {
            continue;
        };
        let session_date = dt_utc.date_naive();
        for (start_date, end_date, inclusive_end, total) in &mut buckets {
            let in_bucket = if *inclusive_end {
                session_date >= *start_date && session_date <= *end_date
            } else {
                session_date >= *start_date && session_date < *end_date
            };
            if in_bucket {
                *total += dur;
                break;
            }
        }
    }

    let last_4_weeks_bars = buckets
        .into_iter()
        .enumerate()
        .map(|(w, (start_date, end_date, _, duration_seconds))| WeekPlaytimeDto {
            week_label: format!("Week {}", w + 1),
            start_date: start_date.format("%Y-%m-%d").to_string(),
            end_date: end_date.format("%Y-%m-%d").to_string(),
            duration_seconds,
        })
        .collect();

    Ok(last_4_weeks_bars)
}

// ---------------------------------------------------------------------------
// StatsRepository Trait & Implementation
// ---------------------------------------------------------------------------

/// Repository trait for aggregating library and play session analytics
pub trait StatsRepository: Send + Sync {
    /// Retrieve aggregated global statistics for the given year (or current UTC year if None)
    fn get_global_statistics(&self, year: Option<i32>) -> Result<GlobalStatsDto, DatabaseError>;

    /// Retrieve detailed session analytics and 4-week bar chart for a single game
    fn get_game_statistics(&self, game_id: Uuid) -> Result<GameStatsDto, DatabaseError>;

    /// Retrieve all recorded play sessions for a given day (YYYY-MM-DD)
    fn get_day_sessions(&self, date_str: &str) -> Result<Vec<DaySessionDto>, DatabaseError>;

    /// Reset game statistics (clears session history, and optionally zeroes games playtime/last_activity)
    fn reset_statistics(&self, reset_playtime: bool) -> Result<(), DatabaseError>;
}

impl StatsRepository for Database {
    fn get_day_sessions(&self, date_str: &str) -> Result<Vec<DaySessionDto>, DatabaseError> {
        let conn = self.reader();
        query_day_sessions(&conn, date_str)
    }

    fn get_global_statistics(&self, year: Option<i32>) -> Result<GlobalStatsDto, DatabaseError> {
        let conn = self.reader();
        let target_year = year.unwrap_or_else(|| Utc::now().year());

        let total_playtime_lifetime_seconds = query_lifetime_playtime(&conn)?;
        let available_years = query_available_years(&conn, target_year)?;
        let activity_heatmap = query_activity_heatmap(&conn, target_year)?;
        let heatmap_total: u64 = activity_heatmap.iter().map(|d| d.duration_seconds).sum();
        let total_playtime_year_seconds = if heatmap_total > 0 {
            heatmap_total
        } else {
            query_year_playtime_fallback(&conn, target_year)?
        };
        let store_distribution = query_store_distribution(&conn)?;
        let genre_distribution = query_genre_distribution(&conn)?;
        let backlog_summary = query_backlog_summary(&conn)?;

        Ok(GlobalStatsDto {
            total_playtime_year_seconds,
            total_playtime_lifetime_seconds,
            available_years,
            activity_heatmap,
            store_distribution,
            genre_distribution,
            backlog_summary,
        })
    }

    fn reset_statistics(&self, reset_playtime: bool) -> Result<(), DatabaseError> {
        let mut conn = self.writer();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM game_sessions;", [])?;
        if reset_playtime {
            tx.execute(
                "UPDATE games SET playtime_seconds = 0, play_count = 0, last_activity = NULL;",
                [],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    fn get_game_statistics(&self, game_id: Uuid) -> Result<GameStatsDto, DatabaseError> {
        let conn = self.reader();
        let game_id_str = game_id.to_string();

        let (average_session_seconds, longest_session_seconds) =
            query_game_session_metrics(&conn, &game_id_str)?;

        let today = Utc::now().date_naive();
        let last_4_weeks_bars = compute_weekly_buckets(&conn, &game_id_str, today)?;

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

    #[inline]
    pub fn reset_statistics(&self, reset_playtime: bool) -> Result<(), DatabaseError> {
        StatsRepository::reset_statistics(self, reset_playtime)
    }
}

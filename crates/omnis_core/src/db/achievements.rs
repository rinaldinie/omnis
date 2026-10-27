use chrono::{DateTime, Utc};
use omnis_sdk::{Achievement, GameAchievementsSummary};
use rusqlite::{params, Result};
use uuid::Uuid;

use crate::db::{Database, DatabaseError};

/// Repository trait for game achievement storage, progress calculation, and icon paths
pub trait AchievementRepository: Send + Sync {
    /// Upsert a list of achievements for a game
    fn upsert_achievements(
        &self,
        game_id: Uuid,
        achievements: &[Achievement],
    ) -> Result<(), DatabaseError>;

    /// Retrieve all achievements and summary for a given game
    fn get_game_achievements(
        &self,
        game_id: Uuid,
    ) -> Result<GameAchievementsSummary, DatabaseError>;

    /// Update the local icon path for a specific achievement
    fn update_achievement_local_icon(
        &self,
        id: &str,
        local_icon_path: &str,
    ) -> Result<(), DatabaseError>;
}

use chrono::{DateTime, Utc};
use omnis_sdk::{Achievement, GameAchievementsSummary};
use rusqlite::{params, Result};
use uuid::Uuid;

use crate::db::{Database, DatabaseError};

impl AchievementRepository for Database {
    /// Upsert a list of achievements for a game
    fn upsert_achievements(
        &self,
        game_id: Uuid,
        achievements: &[Achievement],
    ) -> Result<(), DatabaseError> {
        let mut conn = self.writer();
        let tx = conn.transaction()?;
        let now = Utc::now().to_rfc3339();
        let game_id_str = game_id.to_string();

        {
            let mut stmt = tx.prepare(
                "INSERT INTO game_achievements (
                    id, game_id, api_name, display_name, description,
                    icon_unlocked_url, icon_locked_url, local_icon_path,
                    is_unlocked, unlock_time, rarity_percentage, points,
                    is_hidden, updated_timestamp
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
                ON CONFLICT(id) DO UPDATE SET
                    display_name = excluded.display_name,
                    description = excluded.description,
                    icon_unlocked_url = excluded.icon_unlocked_url,
                    icon_locked_url = excluded.icon_locked_url,
                    local_icon_path = COALESCE(excluded.local_icon_path, game_achievements.local_icon_path),
                    is_unlocked = excluded.is_unlocked,
                    unlock_time = excluded.unlock_time,
                    rarity_percentage = excluded.rarity_percentage,
                    points = excluded.points,
                    is_hidden = excluded.is_hidden,
                    updated_timestamp = excluded.updated_timestamp",
            )?;

            for ach in achievements {
                let unlock_time_str = ach.unlock_time.as_ref().map(|t| t.to_rfc3339());
                let is_unlocked_int = if ach.is_unlocked { 1 } else { 0 };
                let is_hidden_int = if ach.is_hidden { 1 } else { 0 };

                stmt.execute(params![
                    ach.id,
                    game_id_str,
                    ach.api_name,
                    ach.display_name,
                    ach.description,
                    ach.icon_unlocked_url,
                    ach.icon_locked_url,
                    ach.local_icon_path,
                    is_unlocked_int,
                    unlock_time_str,
                    ach.rarity_percentage,
                    ach.points,
                    is_hidden_int,
                    now,
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    /// Retrieve all achievements and summary for a given game
    fn get_game_achievements(
        &self,
        game_id: Uuid,
    ) -> Result<GameAchievementsSummary, DatabaseError> {
        let conn = self.reader();
        let game_id_str = game_id.to_string();

        let mut stmt = conn.prepare(
            "SELECT id, game_id, api_name, display_name, description,
                    icon_unlocked_url, icon_locked_url, local_icon_path,
                    is_unlocked, unlock_time, rarity_percentage, points, is_hidden
             FROM game_achievements
             WHERE game_id = ?1
             ORDER BY is_unlocked DESC, unlock_time DESC, rarity_percentage ASC, display_name ASC",
        )?;

        let rows = stmt.query_map(params![game_id_str], |row| {
            let id: String = row.get(0)?;
            let gid_str: String = row.get(1)?;
            let parsed_gid = Uuid::parse_str(&gid_str).unwrap_or(game_id);
            let api_name: String = row.get(2)?;
            let display_name: String = row.get(3)?;
            let description: Option<String> = row.get(4)?;
            let icon_unlocked_url: String = row.get(5)?;
            let icon_locked_url: Option<String> = row.get(6)?;
            let local_icon_path: Option<String> = row.get(7)?;
            let is_unlocked: bool = row.get::<_, i64>(8)? != 0;
            let unlock_time_str: Option<String> = row.get(9)?;
            let unlock_time = unlock_time_str.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .map(|dt| dt.with_timezone(&Utc))
                    .ok()
            });
            let rarity_percentage: Option<f32> = row.get(10)?;
            let points: Option<u32> = row.get(11)?;
            let is_hidden: bool = row.get::<_, i64>(12)? != 0;

            Ok(Achievement {
                id,
                game_id: parsed_gid,
                api_name,
                display_name,
                description,
                icon_unlocked_url,
                icon_locked_url,
                local_icon_path,
                is_unlocked,
                unlock_time,
                rarity_percentage,
                points,
                is_hidden,
            })
        })?;

        let mut achievements = Vec::new();
        let mut unlocked_count = 0u32;
        let mut total_points = 0u32;
        let mut earned_points = 0u32;

        for res in rows {
            let ach = res?;
            if ach.is_unlocked {
                unlocked_count += 1;
                if let Some(pts) = ach.points {
                    earned_points += pts;
                }
            }
            if let Some(pts) = ach.points {
                total_points += pts;
            }
            achievements.push(ach);
        }

        let total_count = achievements.len() as u32;
        let completion_percentage = if total_count > 0 {
            (unlocked_count as f32 / total_count as f32) * 100.0
        } else {
            0.0
        };

        Ok(GameAchievementsSummary {
            game_id,
            total_count,
            unlocked_count,
            completion_percentage,
            total_points,
            earned_points,
            achievements,
        })
    }

    /// Update the local icon path for a specific achievement
    fn update_achievement_local_icon(
        &self,
        id: &str,
        local_icon_path: &str,
    ) -> Result<(), DatabaseError> {
        let conn = self.writer();
        conn.execute(
            "UPDATE game_achievements SET local_icon_path = ?1 WHERE id = ?2",
            params![local_icon_path, id],
        )?;
        Ok(())
    }
}

// Inherent methods forwarding to AchievementRepository for backward compatibility
impl Database {
    #[inline]
    pub fn upsert_achievements(
        &self,
        game_id: Uuid,
        achievements: &[Achievement],
    ) -> Result<(), DatabaseError> {
        AchievementRepository::upsert_achievements(self, game_id, achievements)
    }

    #[inline]
    pub fn get_game_achievements(
        &self,
        game_id: Uuid,
    ) -> Result<GameAchievementsSummary, DatabaseError> {
        AchievementRepository::get_game_achievements(self, game_id)
    }

    #[inline]
    pub fn update_achievement_local_icon(
        &self,
        id: &str,
        local_icon_path: &str,
    ) -> Result<(), DatabaseError> {
        AchievementRepository::update_achievement_local_icon(self, id, local_icon_path)
    }
}

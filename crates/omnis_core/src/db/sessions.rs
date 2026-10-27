use chrono::Utc;
use omnis_sdk::GameSessionRecord;
use rusqlite::{params, OptionalExtension, Result};
use uuid::Uuid;

use crate::db::{Database, DatabaseError};

/// Repository trait for game session tracking, incremental checkpoints, and playtime history
pub trait SessionRepository: Send + Sync {
    /// Initialize a new active play session in the database
    fn start_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        started_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError>;

    /// Incrementally update an active play session (checkpoint every ~60s)
    fn checkpoint_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        delta_seconds: u64,
        current_time: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError>;

    /// Finalize an active play session, reconciling final total duration and end timestamp
    fn finish_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        total_duration: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError>;

    /// Record a completed play session (convenience wrapper around finish_play_session)
    fn record_play_session(
        &self,
        game_id: Uuid,
        duration_seconds: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError>;

    /// Retrieve all recorded play sessions for a given game ordered by started_at DESC
    fn get_game_sessions(
        &self,
        game_id: Uuid,
    ) -> Result<Vec<GameSessionRecord>, DatabaseError>;
}

use chrono::Utc;
use omnis_sdk::GameSessionRecord;
use rusqlite::{params, OptionalExtension, Result};
use uuid::Uuid;

use crate::db::{Database, DatabaseError};

impl SessionRepository for Database {
    /// Initialize a new active play session in the database
    fn start_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        started_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let started_at_str = started_at.to_rfc3339();

        tx.execute(
            "
            INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds)
            VALUES (?1, ?2, ?3, ?3, 0)
            ON CONFLICT(id) DO NOTHING
            ",
            params![session_id.to_string(), game_id.to_string(), started_at_str,],
        )?;

        tx.execute(
            "
            UPDATE games SET
                play_count = play_count + 1,
                last_activity = ?1,
                modified_timestamp = ?1
            WHERE id = ?2
            ",
            params![started_at_str, game_id.to_string()],
        )?;

        tx.commit()?;
        Ok(())
    }

    /// Incrementally update an active play session (checkpoint every ~60s)
    fn checkpoint_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        delta_seconds: u64,
        current_time: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError> {
        if delta_seconds == 0 {
            return Ok(());
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let now_str = current_time.to_rfc3339();

        tx.execute(
            "
            UPDATE game_sessions SET
                duration_seconds = duration_seconds + ?1,
                ended_at = ?2
            WHERE id = ?3
            ",
            params![delta_seconds as i64, now_str, session_id.to_string()],
        )?;

        tx.execute(
            "
            UPDATE games SET
                playtime_seconds = playtime_seconds + ?1,
                last_activity = ?2,
                modified_timestamp = ?2
            WHERE id = ?3
            ",
            params![delta_seconds as i64, now_str, game_id.to_string()],
        )?;

        tx.commit()?;
        Ok(())
    }

    /// Finalize an active play session, reconciling final total duration and end timestamp
    fn finish_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        total_duration: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let started_at_str = started_at.to_rfc3339();
        let ended_at_str = ended_at.to_rfc3339();

        let existing_duration: Option<i64> = tx
            .query_row(
                "SELECT duration_seconds FROM game_sessions WHERE id = ?1",
                params![session_id.to_string()],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(already_recorded) = existing_duration {
            let already_u64 = already_recorded.max(0) as u64;
            let remaining_delta = total_duration.saturating_sub(already_u64);

            tx.execute(
                "
                UPDATE game_sessions SET
                    duration_seconds = ?1,
                    ended_at = ?2
                WHERE id = ?3
                ",
                params![total_duration as i64, ended_at_str, session_id.to_string()],
            )?;

            if remaining_delta > 0 {
                tx.execute(
                    "
                    UPDATE games SET
                        playtime_seconds = playtime_seconds + ?1,
                        last_activity = ?2,
                        modified_timestamp = ?2
                    WHERE id = ?3
                    ",
                    params![remaining_delta as i64, ended_at_str, game_id.to_string()],
                )?;
            }
        } else {
            tx.execute(
                "
                INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ",
                params![
                    session_id.to_string(),
                    game_id.to_string(),
                    started_at_str,
                    ended_at_str,
                    total_duration as i64,
                ],
            )?;

            tx.execute(
                "
                UPDATE games SET
                    playtime_seconds = playtime_seconds + ?1,
                    play_count = play_count + 1,
                    last_activity = ?2,
                    modified_timestamp = ?2
                WHERE id = ?3
                ",
                params![total_duration as i64, ended_at_str, game_id.to_string(),],
            )?;
        }

        tx.commit()?;

        Ok(GameSessionRecord {
            id: session_id,
            game_id,
            started_at,
            ended_at,
            duration_seconds: total_duration,
        })
    }

    /// Record a completed play session (convenience wrapper around finish_play_session)
    fn record_play_session(
        &self,
        game_id: Uuid,
        duration_seconds: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError> {
        self.finish_play_session(
            Uuid::new_v4(),
            game_id,
            duration_seconds,
            started_at,
            ended_at,
        )
    }

    /// Retrieve all recorded play sessions for a given game ordered by started_at DESC
    fn get_game_sessions(
        &self,
        game_id: Uuid,
    ) -> Result<Vec<GameSessionRecord>, DatabaseError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "
            SELECT id, game_id, started_at, ended_at, duration_seconds
            FROM game_sessions
            WHERE game_id = ?1
            ORDER BY started_at DESC
            ",
        )?;

        let rows = stmt.query_map(params![game_id.to_string()], |row| {
            let id_str: String = row.get(0)?;
            let id = Uuid::parse_str(&id_str).unwrap_or_else(|_| Uuid::new_v4());
            let game_id_str: String = row.get(1)?;
            let g_id = Uuid::parse_str(&game_id_str).unwrap_or(game_id);
            let started_str: String = row.get(2)?;
            let started_at = DateTime::parse_from_rfc3339(&started_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let ended_str: String = row.get(3)?;
            let ended_at = DateTime::parse_from_rfc3339(&ended_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let duration_seconds: i64 = row.get(4)?;

            Ok(GameSessionRecord {
                id,
                game_id: g_id,
                started_at,
                ended_at,
                duration_seconds: duration_seconds.max(0) as u64,
            })
        })?;

        let mut sessions = Vec::new();
        for r in rows {
            sessions.push(r?);
        }
        Ok(sessions)
    }
}

// Inherent methods forwarding to SessionRepository for backward compatibility
impl Database {
    #[inline]
    pub fn start_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        started_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError> {
        SessionRepository::start_play_session(self, session_id, game_id, started_at)
    }

    #[inline]
    pub fn checkpoint_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        delta_seconds: u64,
        current_time: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError> {
        SessionRepository::checkpoint_play_session(self, session_id, game_id, delta_seconds, current_time)
    }

    #[inline]
    pub fn finish_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        total_duration: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError> {
        SessionRepository::finish_play_session(self, session_id, game_id, total_duration, started_at, ended_at)
    }

    #[inline]
    pub fn record_play_session(
        &self,
        game_id: Uuid,
        duration_seconds: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError> {
        SessionRepository::record_play_session(self, game_id, duration_seconds, started_at, ended_at)
    }

    #[inline]
    pub fn get_game_sessions(
        &self,
        game_id: Uuid,
    ) -> Result<Vec<GameSessionRecord>, DatabaseError> {
        SessionRepository::get_game_sessions(self, game_id)
    }
}

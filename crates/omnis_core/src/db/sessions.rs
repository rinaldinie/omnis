use chrono::{DateTime, Utc};
use omnis_sdk::{ExternalSessionDto, GameSessionRecord};
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
    fn get_game_sessions(&self, game_id: Uuid) -> Result<Vec<GameSessionRecord>, DatabaseError>;

    /// Ingest external historical sessions for games matching the given library_id,
    /// deduplicating against existing sessions and updating playtime metrics.
    fn ingest_external_sessions(
        &self,
        library_id: &str,
        sessions: &[ExternalSessionDto],
    ) -> Result<usize, DatabaseError>;

    /// Cancel an active or pending play session on launch failure or early abort,
    /// removing the unrecorded session and reverting premature metric increments.
    fn cancel_play_session(&self, session_id: Uuid, game_id: Uuid) -> Result<(), DatabaseError>;
}

impl SessionRepository for Database {
    /// Initialize a new active play session in the database
    fn start_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        started_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError> {
        let mut conn = self.writer();
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
                completion_status = CASE
                    WHEN completion_status IS NULL OR completion_status = 'NotPlayed' THEN 'Playing'
                    ELSE completion_status
                END,
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
        let mut conn = self.writer();
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
        let mut conn = self.writer();
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
                    completion_status = CASE
                        WHEN completion_status IS NULL OR completion_status = 'NotPlayed' THEN 'Playing'
                        ELSE completion_status
                    END,
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
    fn get_game_sessions(&self, game_id: Uuid) -> Result<Vec<GameSessionRecord>, DatabaseError> {
        let conn = self.reader();
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

    fn ingest_external_sessions(
        &self,
        library_id: &str,
        sessions: &[ExternalSessionDto],
    ) -> Result<usize, DatabaseError> {
        if sessions.is_empty() {
            return Ok(0);
        }

        let mut conn = self.writer();

        let mut stmt = conn.prepare("SELECT id, external_id FROM games WHERE library_id = ?1;")?;

        let mut store_games: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        let rows = stmt.query_map(params![library_id], |row| {
            Ok((row.get::<_, String>(1)?, row.get::<_, String>(0)?))
        })?;

        for r in rows {
            let (ext_id, id) = r?;
            store_games.insert(ext_id, id);
        }
        drop(stmt);

        // Group incoming sessions by target game_id
        let mut sessions_by_game: std::collections::HashMap<String, Vec<&ExternalSessionDto>> =
            std::collections::HashMap::new();
        for s in sessions {
            if let Some(game_id) = store_games.get(&s.external_id) {
                sessions_by_game
                    .entry(game_id.clone())
                    .or_default()
                    .push(s);
            }
        }

        let tx = conn.transaction()?;
        let mut total_inserted = 0;

        struct DbSession {
            id: String,
            started_at: DateTime<Utc>,
            ended_at: DateTime<Utc>,
            duration_seconds: u64,
        }

        for (game_id, incoming_list) in sessions_by_game {
            // 1. Fetch existing sessions for this game
            let mut existing: Vec<DbSession> = {
                let mut stmt_sess = tx.prepare(
                    "SELECT id, started_at, ended_at, duration_seconds
                     FROM game_sessions
                     WHERE game_id = ?1
                     ORDER BY started_at ASC;",
                )?;
                let s_rows = stmt_sess.query_map(params![game_id], |row| {
                    let id: String = row.get(0)?;
                    let start_str: String = row.get(1)?;
                    let end_str: String = row.get(2)?;
                    let dur_i64: i64 = row.get(3)?;
                    let dur = dur_i64.max(0) as u64;

                    let started_at = parse_rfc3339_or_fallback(&start_str)
                        .unwrap_or_else(Utc::now);
                    let ended_at = parse_rfc3339_or_fallback(&end_str)
                        .unwrap_or_else(|| started_at + chrono::Duration::seconds(dur as i64));

                    Ok(DbSession {
                        id,
                        started_at,
                        ended_at,
                        duration_seconds: dur,
                    })
                })?;
                let mut list = Vec::new();
                for r in s_rows {
                    list.push(r?);
                }
                list
            };

            // 2. Deduplicate any pre-existing duplicate sessions in database for this game
            let mut removed_ids = Vec::new();
            let mut total_removed_duration: i64 = 0;
            let mut total_removed_count: i64 = 0;

            let mut i = 0;
            while i < existing.len() {
                let mut j = i + 1;
                while j < existing.len() {
                    if is_same_play_session(
                        existing[i].started_at,
                        existing[i].ended_at,
                        existing[i].duration_seconds,
                        existing[j].started_at,
                        existing[j].ended_at,
                        existing[j].duration_seconds,
                    ) {
                        // Found duplicate pair (i, j). Remove the one with smaller duration
                        let remove_idx = if existing[j].duration_seconds > existing[i].duration_seconds {
                            i
                        } else {
                            j
                        };
                        let removed = existing.remove(remove_idx);
                        removed_ids.push(removed.id);
                        total_removed_duration += removed.duration_seconds as i64;
                        total_removed_count += 1;
                        if remove_idx == i {
                            j = i + 1;
                        }
                    } else {
                        j += 1;
                    }
                }
                i += 1;
            }

            for rem_id in &removed_ids {
                tx.execute(
                    "DELETE FROM game_sessions WHERE id = ?1;",
                    params![rem_id],
                )?;
            }

            let mut game_touched = false;

            // 3. Process incoming sessions from external source
            for s in incoming_list {
                let s_start = match parse_rfc3339_or_fallback(&s.started_at) {
                    Some(dt) => dt,
                    None => continue,
                };
                let s_dur = s.duration_seconds;
                let s_end = parse_rfc3339_or_fallback(&s.ended_at)
                    .unwrap_or_else(|| s_start + chrono::Duration::seconds(s_dur as i64));

                let mut matched = false;
                for ex in existing.iter_mut() {
                    if is_same_play_session(
                        ex.started_at,
                        ex.ended_at,
                        ex.duration_seconds,
                        s_start,
                        s_end,
                        s_dur,
                    ) {
                        matched = true;
                        // If external session has significantly more duration (e.g. recovering after app crash)
                        if s_dur > ex.duration_seconds && s_dur.saturating_sub(ex.duration_seconds) >= 60 {
                            tx.execute(
                                "UPDATE game_sessions SET ended_at = ?1, duration_seconds = ?2 WHERE id = ?3;",
                                params![s.ended_at, s_dur as i64, ex.id],
                            )?;
                            ex.ended_at = s_end;
                            ex.duration_seconds = s_dur;
                            game_touched = true;
                        }
                        break;
                    }
                }

                if !matched {
                    let session_id = uuid::Uuid::new_v4().to_string();
                    tx.execute(
                        "INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds)
                         VALUES (?1, ?2, ?3, ?4, ?5);",
                        params![
                            session_id,
                            game_id,
                            s.started_at,
                            s.ended_at,
                            s_dur as i64
                        ],
                    )?;
                    existing.push(DbSession {
                        id: session_id,
                        started_at: s_start,
                        ended_at: s_end,
                        duration_seconds: s_dur,
                    });
                    total_inserted += 1;
                    game_touched = true;
                }
            }

            // 4. Reconcile game metrics if sessions were added, updated, or duplicates removed
            if game_touched || total_removed_count > 0 {
                let session_count: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM game_sessions WHERE game_id = ?1;",
                        params![game_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);

                let sum_duration: i64 = tx
                    .query_row(
                        "SELECT COALESCE(SUM(duration_seconds), 0) FROM game_sessions WHERE game_id = ?1;",
                        params![game_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);

                let max_ended: Option<String> = tx
                    .query_row(
                        "SELECT MAX(ended_at) FROM game_sessions WHERE game_id = ?1;",
                        params![game_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(None);

                let (current_playtime, current_play_count): (i64, i32) = tx
                    .query_row(
                        "SELECT playtime_seconds, play_count FROM games WHERE id = ?1;",
                        params![game_id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .unwrap_or((0, 0));

                let new_playtime = (current_playtime - total_removed_duration).max(sum_duration);
                let new_play_count =
                    (current_play_count as i64 - total_removed_count).max(session_count) as i32;

                tx.execute(
                    "UPDATE games SET
                        play_count = ?1,
                        playtime_seconds = ?2,
                        last_activity = CASE
                            WHEN ?3 IS NOT NULL AND (last_activity IS NULL OR ?3 > last_activity) THEN ?3
                            ELSE last_activity
                        END,
                        completion_status = CASE
                            WHEN (completion_status IS NULL OR completion_status = 'NotPlayed') AND ?2 > 0 THEN 'Playing'
                            ELSE completion_status
                        END,
                        modified_timestamp = COALESCE(?3, modified_timestamp)
                     WHERE id = ?4;",
                    params![new_play_count, new_playtime, max_ended, game_id],
                )?;
            }
        }

        tx.commit()?;
        Ok(total_inserted)
    }

    fn cancel_play_session(&self, session_id: Uuid, game_id: Uuid) -> Result<(), DatabaseError> {
        let mut conn = self.writer();
        let tx = conn.transaction()?;

        // Delete uncompleted / failed session
        tx.execute(
            "DELETE FROM game_sessions WHERE id = ?1",
            params![session_id.to_string()],
        )?;

        // Revert play_count that was incremented at start_play_session
        let now_str = chrono::Utc::now().to_rfc3339();
        tx.execute(
            "
            UPDATE games SET
                play_count = MAX(0, play_count - 1),
                modified_timestamp = ?1
            WHERE id = ?2
            ",
            params![now_str, game_id.to_string()],
        )?;

        // If game has 0 play_count and 0 playtime_seconds, revert completion_status if it was marked 'Playing'
        tx.execute(
            "
            UPDATE games SET
                completion_status = 'NotPlayed',
                modified_timestamp = ?1
            WHERE id = ?2 AND play_count = 0 AND playtime_seconds = 0 AND completion_status = 'Playing'
            ",
            params![now_str, game_id.to_string()],
        )?;

        tx.commit()?;
        Ok(())
    }
}

// Inherent methods forwarding to SessionRepository for backward compatibility
impl Database {
    #[inline]
    pub fn ingest_external_sessions(
        &self,
        library_id: &str,
        sessions: &[ExternalSessionDto],
    ) -> Result<usize, DatabaseError> {
        SessionRepository::ingest_external_sessions(self, library_id, sessions)
    }
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
        SessionRepository::checkpoint_play_session(
            self,
            session_id,
            game_id,
            delta_seconds,
            current_time,
        )
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
        SessionRepository::finish_play_session(
            self,
            session_id,
            game_id,
            total_duration,
            started_at,
            ended_at,
        )
    }

    #[inline]
    pub fn record_play_session(
        &self,
        game_id: Uuid,
        duration_seconds: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError> {
        SessionRepository::record_play_session(
            self,
            game_id,
            duration_seconds,
            started_at,
            ended_at,
        )
    }

    #[inline]
    pub fn get_game_sessions(
        &self,
        game_id: Uuid,
    ) -> Result<Vec<GameSessionRecord>, DatabaseError> {
        SessionRepository::get_game_sessions(self, game_id)
    }

    #[inline]
    pub fn cancel_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
    ) -> Result<(), DatabaseError> {
        SessionRepository::cancel_play_session(self, session_id, game_id)
    }
}

/// Helper to parse ISO 8601 / RFC 3339 or common database date strings.
pub fn parse_rfc3339_or_fallback(s: &str) -> Option<DateTime<Utc>> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    DateTime::parse_from_rfc3339(trimmed)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|naive| naive.and_utc())
        })
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S")
                .ok()
                .map(|naive| naive.and_utc())
        })
}

/// Determines whether two recorded sessions correspond to the same physical play session.
/// Accounts for minor clock differences, launcher startup delays (5-60s), and interval overlaps.
pub fn is_same_play_session(
    s1_start: DateTime<Utc>,
    s1_end: DateTime<Utc>,
    s1_dur: u64,
    s2_start: DateTime<Utc>,
    s2_end: DateTime<Utc>,
    s2_dur: u64,
) -> bool {
    let eff_s1_end = if s1_end >= s1_start {
        s1_end
    } else {
        s1_start + chrono::Duration::seconds(s1_dur as i64)
    };
    let eff_s2_end = if s2_end >= s2_start {
        s2_end
    } else {
        s2_start + chrono::Duration::seconds(s2_dur as i64)
    };

    let start_diff = (s1_start - s2_start).num_seconds().abs();
    let end_diff = (eff_s1_end - eff_s2_end).num_seconds().abs();
    let dur_diff = (s1_dur as i64 - s2_dur as i64).abs();

    // 1. Both start and end within a reasonable tolerance window (180s)
    if start_diff <= 180 && end_diff <= 180 {
        return true;
    }

    // 2. Both start close and have very similar durations
    if start_diff <= 180 && dur_diff <= 180 {
        return true;
    }

    // 3. Both end close and have very similar durations
    if end_diff <= 180 && dur_diff <= 180 {
        return true;
    }

    // 4. Substantial interval overlap
    let overlap_start = s1_start.max(s2_start);
    let overlap_end = eff_s1_end.min(eff_s2_end);
    let overlap_secs = (overlap_end - overlap_start).num_seconds();

    if overlap_secs > 0 {
        let min_dur = (s1_dur.min(s2_dur) as i64).max(1);
        if overlap_secs >= 15 && (overlap_secs * 2 >= min_dur || min_dur - overlap_secs <= 180) {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_same_play_session_detection() {
        // 1. Exact match
        let t1 = parse_rfc3339_or_fallback("2026-11-11T19:58:27Z").unwrap();
        let t2 = parse_rfc3339_or_fallback("2026-11-11T20:28:27Z").unwrap();
        assert!(is_same_play_session(t1, t2, 1800, t1, t2, 1800));

        // 2. Omnis real-time tracking vs Steam gameprocess_log (18s start delay, 2s end diff)
        let omnis_start = parse_rfc3339_or_fallback("2026-11-11T19:58:12.345678+00:00").unwrap();
        let omnis_end = parse_rfc3339_or_fallback("2026-11-11T20:28:40.123456+00:00").unwrap();
        let steam_start = parse_rfc3339_or_fallback("2026-11-11T19:58:30+00:00").unwrap();
        let steam_end = parse_rfc3339_or_fallback("2026-11-11T20:28:38+00:00").unwrap();
        assert!(is_same_play_session(omnis_start, omnis_end, 1828, steam_start, steam_end, 1808));

        // 3. Different minute boundary (Omnis 19:58:55, Steam 19:59:10)
        let om_start_min = parse_rfc3339_or_fallback("2026-11-11T19:58:55Z").unwrap();
        let om_end_min = parse_rfc3339_or_fallback("2026-11-11T20:58:55Z").unwrap();
        let st_start_min = parse_rfc3339_or_fallback("2026-11-11T19:59:10Z").unwrap();
        let st_end_min = parse_rfc3339_or_fallback("2026-11-11T20:58:50Z").unwrap();
        assert!(is_same_play_session(om_start_min, om_end_min, 3600, st_start_min, st_end_min, 3580));

        // 4. Two separate distinct sessions (5 hours apart) -> must NOT match
        let morning_start = parse_rfc3339_or_fallback("2026-11-11T10:00:00Z").unwrap();
        let morning_end = parse_rfc3339_or_fallback("2026-11-11T10:30:00Z").unwrap();
        let evening_start = parse_rfc3339_or_fallback("2026-11-11T19:00:00Z").unwrap();
        let evening_end = parse_rfc3339_or_fallback("2026-11-11T19:30:00Z").unwrap();
        assert!(!is_same_play_session(morning_start, morning_end, 1800, evening_start, evening_end, 1800));

        // 5. Immediate game restart after crash (ended 14:00:45, next started 14:01:00) -> must NOT match
        let crash_start = parse_rfc3339_or_fallback("2026-11-11T14:00:00Z").unwrap();
        let crash_end = parse_rfc3339_or_fallback("2026-11-11T14:00:45Z").unwrap();
        let restart_start = parse_rfc3339_or_fallback("2026-11-11T14:01:00Z").unwrap();
        let restart_end = parse_rfc3339_or_fallback("2026-11-11T14:30:00Z").unwrap();
        assert!(!is_same_play_session(crash_start, crash_end, 45, restart_start, restart_end, 1740));
    }
}

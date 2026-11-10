import React, { useEffect, useMemo, useState } from 'react';
import {
  Gamepad2,
  FolderOpen,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Info,
  PlayCircle,
  ListChecks,
  FileSearch,
  FolderPlus,
  Plus,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { api } from '../../api';
import type { EmulatorSettings, EmulatorStatus } from '../../api/games';
import type { GameDto } from '../../types';
import soundEffects from '../../utils/soundEffects';
import { SettingGroup, SettingRadioOption, SettingRow, ToggleSwitch } from './SettingsControls';

export interface EmulatorsSettingsTabProps {
  onSyncComplete?: () => void;
}

const SWITCH_LIBRARY = 'switch';

/**
 * Settings > Emulators > Nintendo Switch: detected emulators, default emulator, per-game
 * emulator exceptions, and the opt-in to read the emulator's keys for titles and icons.
 */
export const EmulatorsSettingsTab: React.FC<EmulatorsSettingsTabProps> = ({ onSyncComplete }) => {
  const { t } = useTranslation();
  const [emulators, setEmulators] = useState<EmulatorStatus[] | null>(null);
  const [settings, setSettings] = useState<EmulatorSettings>({ use_emulator_keys: false });
  const [switchGames, setSwitchGames] = useState<GameDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const loadStatus = () =>
    api.games.getEmulatorStatus().then(setEmulators).catch(() => setEmulators([]));

  useEffect(() => {
    loadStatus();
    api.games.getEmulatorSettings().then(setSettings).catch(console.debug);
    api.games
      .getGames()
      .then((games) =>
        setSwitchGames(
          games
            .filter((g) => g.library === SWITCH_LIBRARY && g.external_id)
            .sort((a, b) => a.title.localeCompare(b.title))
        )
      )
      .catch(console.debug);
  }, []);

  const launchable = useMemo(
    () => (emulators ?? []).filter((e) => !!e.executable),
    [emulators]
  );
  const defaultEmulator = launchable.find((e) => e.is_default) ?? launchable[0];
  const anyKeys = (emulators ?? []).some((e) => e.has_keys);

  /** Saves settings; the backend re-applies them to the Switch library right away. */
  const save = async (next: EmulatorSettings) => {
    const previous = settings;
    setSettings(next);
    setBusy(true);
    try {
      await api.games.setEmulatorSettings(next);
      await loadStatus();
      onSyncComplete?.();
    } catch (e) {
      console.error('Failed to save emulator settings:', e);
      setSettings(previous);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleKeys = (checked: boolean) => {
    soundEffects.playSelect();
    save({ ...settings, use_emulator_keys: checked });
  };

  const handleDefault = (id: string) => {
    soundEffects.playSelect();
    save({ ...settings, switch_default_emulator: id });
  };

  const handleGameEmulator = (titleId: string, emulatorId: string) => {
    soundEffects.playSelect();
    const perGame = { ...(settings.switch_game_emulators ?? {}) };
    if (emulatorId) perGame[titleId] = emulatorId;
    else delete perGame[titleId];
    save({ ...settings, switch_game_emulators: perGame });
  };

  /** Lets the user pick an emulator executable Omnis could not find on its own. */
  const handlePickExecutable = async () => {
    soundEffects.playSelect();
    setPickError(null);
    const path = await api.games.pickExecutableFile().catch(() => null);
    if (!path) return;
    const name = await api.games.identifyEmulatorExecutable(path).catch(() => null);
    if (!name) {
      setPickError(
        t('emulators_settings.pick_unknown', {
          defaultValue: 'Il file scelto non è un emulatore Switch supportato (Eden, Citron, Sudachi, Suyu, yuzu, Ryujinx).',
        })
      );
      return;
    }
    const others = (settings.switch_custom_executables ?? []).filter((p) => p !== path);
    save({ ...settings, switch_custom_executables: [...others, path] });
  };

  const handleRemoveExecutable = (path: string) => {
    soundEffects.playSelect();
    save({
      ...settings,
      switch_custom_executables: (settings.switch_custom_executables ?? []).filter(
        (p) => p.toLowerCase() !== path.toLowerCase()
      ),
    });
  };

  const handleAddFolder = async () => {
    soundEffects.playSelect();
    const dir = await api.games.pickDirectory().catch(() => null);
    if (!dir) return;
    const current = settings.switch_extra_game_dirs ?? [];
    if (current.some((d) => d.toLowerCase() === dir.toLowerCase())) return;
    save({ ...settings, switch_extra_game_dirs: [...current, dir] });
  };

  const handleRemoveFolder = (dir: string) => {
    soundEffects.playSelect();
    save({
      ...settings,
      switch_extra_game_dirs: (settings.switch_extra_game_dirs ?? []).filter((d) => d !== dir),
    });
  };

  const smallButton =
    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer disabled:opacity-50 shrink-0';
  const smallButtonStyle = { borderColor: 'var(--border-color)', color: 'var(--text-primary)' };

  const handleSync = async () => {
    soundEffects.playSelect();
    setBusy(true);
    try {
      await api.games.syncLibrary();
      await loadStatus();
      onSyncComplete?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
      <SettingGroup
        title={t('emulators_settings.detected_title', { defaultValue: 'Emulatori rilevati' })}
        description={t('emulators_settings.detected_desc', {
          defaultValue:
            'Omnis legge le cartelle dei giochi configurate negli emulatori: non serve impostare nulla qui.',
        })}
        icon={<Gamepad2 className="w-4 h-4" />}
        action={
          <button
            onClick={handleSync}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-50"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            {t('emulators_settings.sync', { defaultValue: 'Aggiorna libreria' })}
          </button>
        }
      >
        {emulators === null ? null : emulators.length === 0 ? (
          <SettingRow
            title={t('emulators_settings.none_title', { defaultValue: 'Nessun emulatore Switch trovato' })}
            description={t('emulators_settings.none_desc', {
              defaultValue:
                "Apri almeno una volta Eden, Citron o Ryujinx, oppure indica tu dove si trova l'emulatore.",
            })}
          />
        ) : (
          emulators.map((emu) => (
            <SettingRow
              key={emu.id}
              icon={<Gamepad2 className="w-4 h-4" />}
              title={
                <span>
                  {emu.name} <span className="text-[10px] opacity-60">· {emu.platform}</span>
                </span>
              }
              description={
                <span className="flex flex-col gap-0.5 font-mono text-[10px] break-all">
                  <span>
                    {emu.executable ??
                      t('emulators_settings.no_exe', {
                        defaultValue: 'Eseguibile non trovato (avvio non disponibile)',
                      })}
                    {emu.custom_executable && (
                      <span className="ml-1 opacity-60">
                        · {t('emulators_settings.custom_exe', { defaultValue: 'scelto a mano' })}
                      </span>
                    )}
                  </span>
                  {emu.game_dirs.map((dir) => (
                    <span key={dir} className="flex items-center gap-1 opacity-80">
                      <FolderOpen className="w-3 h-3 shrink-0" /> {dir}
                    </span>
                  ))}
                </span>
              }
              badge={
                emu.has_keys ? (
                  <span title={t('emulators_settings.has_keys', { defaultValue: 'Chiavi presenti' })}>
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  </span>
                ) : undefined
              }
            >
              {!emu.executable && (
                <button onClick={handlePickExecutable} disabled={busy} className={smallButton} style={smallButtonStyle}>
                  <FileSearch className="w-3.5 h-3.5" />
                  {t('emulators_settings.pick_exe', { defaultValue: 'Scegli eseguibile…' })}
                </button>
              )}
              {emu.custom_executable && emu.executable && (
                <button
                  onClick={() => handleRemoveExecutable(emu.executable!)}
                  disabled={busy}
                  className={smallButton}
                  style={smallButtonStyle}
                  title={t('emulators_settings.remove_exe', { defaultValue: 'Torna al rilevamento automatico' })}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </SettingRow>
          ))
        )}
        <SettingRow
          icon={<Plus className="w-4 h-4" />}
          title={t('emulators_settings.add_emulator', { defaultValue: 'Aggiungi emulatore' })}
          description={
            pickError ? (
              <span className="flex items-start gap-1 text-amber-300">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {pickError}
              </span>
            ) : (
              t('emulators_settings.add_emulator_desc', {
                defaultValue: "Se Omnis non trova un emulatore, scegli tu il suo file .exe.",
              })
            )
          }
        >
          <button onClick={handlePickExecutable} disabled={busy} className={smallButton} style={smallButtonStyle}>
            <FileSearch className="w-3.5 h-3.5" />
            {t('emulators_settings.pick_exe', { defaultValue: 'Scegli eseguibile…' })}
          </button>
        </SettingRow>
      </SettingGroup>

      <SettingGroup
        title={t('emulators_settings.extra_dirs_title', { defaultValue: 'Cartelle giochi aggiuntive' })}
        description={t('emulators_settings.extra_dirs_desc', {
          defaultValue:
            'Cartelle con file .nsp / .xci da includere oltre a quelle impostate negli emulatori (sottocartelle comprese).',
        })}
        icon={<FolderPlus className="w-4 h-4" />}
        action={
          <button onClick={handleAddFolder} disabled={busy} className={smallButton} style={smallButtonStyle}>
            <FolderPlus className="w-3.5 h-3.5" />
            {t('emulators_settings.add_folder', { defaultValue: 'Aggiungi cartella…' })}
          </button>
        }
      >
        {(settings.switch_extra_game_dirs ?? []).length === 0 ? (
          <SettingRow
            title={t('emulators_settings.no_extra_dirs', { defaultValue: 'Nessuna cartella aggiuntiva' })}
          />
        ) : (
          (settings.switch_extra_game_dirs ?? []).map((dir) => (
            <SettingRow
              key={dir}
              icon={<FolderOpen className="w-4 h-4" />}
              title={<span className="font-mono text-[11px] break-all">{dir}</span>}
            >
              <button
                onClick={() => handleRemoveFolder(dir)}
                disabled={busy}
                className={smallButton}
                style={smallButtonStyle}
                title={t('emulators_settings.remove_folder', { defaultValue: 'Rimuovi cartella' })}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </SettingRow>
          ))
        )}
      </SettingGroup>

      {launchable.length > 0 && (
        <SettingGroup
          title={t('emulators_settings.default_title', { defaultValue: 'Emulatore predefinito' })}
          description={
            launchable.length === 1
              ? t('emulators_settings.default_single', {
                  defaultValue: "È l'unico emulatore avviabile trovato: i giochi si aprono con questo.",
                })
              : t('emulators_settings.default_desc', {
                  defaultValue: 'Emulatore usato per avviare i giochi Switch, salvo eccezioni per singolo gioco.',
                })
          }
          icon={<PlayCircle className="w-4 h-4" />}
        >
          {launchable.map((emu) => (
            <SettingRadioOption
              key={emu.id}
              selected={defaultEmulator?.id === emu.id}
              onSelect={() => !busy && launchable.length > 1 && handleDefault(emu.id)}
              title={emu.name}
              subtitle={emu.executable ?? undefined}
            />
          ))}
        </SettingGroup>
      )}

      {launchable.length > 1 && switchGames.length > 0 && (
        <SettingGroup
          title={t('emulators_settings.per_game_title', { defaultValue: 'Emulatore per gioco' })}
          description={t('emulators_settings.per_game_desc', {
            defaultValue: 'Scegli un emulatore diverso per i giochi che funzionano meglio altrove.',
          })}
          icon={<ListChecks className="w-4 h-4" />}
        >
          {switchGames.map((game) => {
            const titleId = (game.external_id ?? '').toUpperCase();
            const chosen = settings.switch_game_emulators?.[titleId] ?? '';
            return (
              <SettingRow key={game.id} title={game.title}>
                <select
                  value={chosen}
                  disabled={busy}
                  onChange={(e) => handleGameEmulator(titleId, e.target.value)}
                  aria-label={t('emulators_settings.per_game_select', {
                    defaultValue: 'Emulatore per {title}',
                    title: game.title,
                  })}
                  className="px-2.5 py-1.5 rounded-lg border text-[11px] outline-none cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">
                    {t('emulators_settings.per_game_default', {
                      defaultValue: 'Predefinito ({name})',
                      name: defaultEmulator?.name ?? '—',
                    })}
                  </option>
                  {launchable.map((emu) => (
                    <option key={emu.id} value={emu.id}>
                      {emu.name}
                    </option>
                  ))}
                </select>
              </SettingRow>
            );
          })}
        </SettingGroup>
      )}

      <SettingGroup
        title={t('emulators_settings.keys_title', { defaultValue: 'Titoli e icone ufficiali' })}
        description={t('emulators_settings.keys_desc', {
          defaultValue:
            "Mostra nome e icona di ogni gioco come nell'emulatore, usando le chiavi che hai già fornito all'emulatore.",
        })}
        icon={<KeyRound className="w-4 h-4" />}
      >
        <SettingRow
          icon={<KeyRound className="w-4 h-4" />}
          title={t('emulators_settings.use_keys', { defaultValue: "Usa le chiavi dell'emulatore" })}
          description={
            anyKeys
              ? t('emulators_settings.use_keys_desc', {
                  defaultValue: 'Si applica subito ai giochi Switch.',
                })
              : t('emulators_settings.use_keys_missing', {
                  defaultValue: 'Nessun prod.keys trovato negli emulatori rilevati.',
                })
          }
        >
          <ToggleSwitch
            checked={settings.use_emulator_keys}
            onChange={handleToggleKeys}
            disabled={busy}
            ariaLabel={t('emulators_settings.use_keys', { defaultValue: "Usa le chiavi dell'emulatore" })}
          />
        </SettingRow>
      </SettingGroup>

      <div
        className="p-3.5 rounded-2xl border flex items-start gap-3 text-xs"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
          color: 'var(--text-primary)',
        }}
      >
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
        <div className="leading-relaxed text-slate-300 space-y-1">
          <p>
            {t('emulators_settings.privacy', {
              defaultValue:
                "Le chiavi vengono lette solo in memoria dalla cartella dell'emulatore durante l'aggiornamento: Omnis non le copia, non le salva e non le invia.",
            })}
          </p>
          <p className="flex items-start gap-1.5 opacity-80">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {t('emulators_settings.playtime_note', {
              defaultValue: 'Le ore di gioco registrate da Eden, Citron e Ryujinx vengono importate sempre.',
            })}
          </p>
        </div>
      </div>
    </div>
  );
};

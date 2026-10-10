import { useState } from 'react';
import { Save, Check, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { reportError } from '@/lib/report';
import { removeProjectFiles } from '@/lib/projectCleanup';
import { useAuth } from '@/context/AuthContext';
import type { Project } from '@/types';
import { useI18n } from '@/context/I18nContext';

export function ProjectSettingsTab({ projectId, project }: { projectId: string; project: Project }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('projects').update({ name, description }).eq('id', projectId);
    if (err) {
        reportError(err, { where: 'ProjectSettingsTab.save' });
      setError(friendlyError(err, t('common.error'), t));
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    setError(null);
    try {
      // Fichiers d'abord : si cela échoue, le projet est conservé et l'opération peut être relancée.
      await removeProjectFiles(user.id, projectId);
      const { error: err } = await supabase.from('projects').delete().eq('id', projectId);
      if (err) throw err;
      navigate('/projects');
    } catch (err) {
      reportError(err, { where: 'ProjectSettingsTab.delete' });
      setError(friendlyError(err, t('common.error'), t));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{t('settings.title')}</h2>
        <p className="text-sm text-neutral-500 mt-1">{t('settings.project.desc')}</p>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-700">{error}</div>}

      <div className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('newproject.name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('newproject.description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder={t('newproject.description.placeholder')}
          />
        </div>
        <div className="flex items-center gap-3 pt-3 border-t border-neutral-100">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? t('settings.saving') : t('settings.save')} {!saving && <Save className="w-4 h-4" />}
          </button>
          {saved && (
            <span className="badge-forest animate-fade-in">
              <Check className="w-3 h-3" /> {t('settings.saved')}
            </span>
          )}
        </div>
      </div>

      <div className="card p-6 border-clay-200">
        <h3 className="font-semibold text-clay-700 mb-1">{t('settings.security.danger')}</h3>
        <p className="text-sm text-neutral-500 mb-4">{t('settings.security.danger.desc')}</p>
        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="btn-secondary text-clay-600 hover:bg-clay-50 border-clay-200"
          >
            <Trash2 className="w-4 h-4" /> {t('settings.security.delete')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn-primary bg-clay-600 hover:bg-clay-700 border-clay-600"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              {t('common.delete')}
            </button>
            <button onClick={() => setDeleteConfirm(false)} className="btn-ghost text-sm">
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { NotebookPen, Save, Check, RefreshCw } from 'lucide-react';
import { readAdditionalInfo, saveAdditionalInfo } from '../../../../lib/knowledge-notes';
import { useT } from '../../../../i18n/LanguageContext';

/**
 * Everything the owner told the assistant by hand.
 *
 * The knowledge base is otherwise everything the crawler could read off the
 * website — which leaves out precisely the things that were never written on
 * it: the price nobody publishes, the exception to the return policy, the
 * answer to whatever a visitor asked last week that the site doesn't cover.
 * Those arrive here from the Conversations page ("Answer this" on a question
 * that went unanswered) and can be read back, corrected and extended here.
 *
 * Self-contained on purpose: it reads and writes its own content through
 * lib/knowledge-notes, so it needs the active site and nothing else threaded
 * down from the dashboard.
 */
export default function AdditionalInfoCard({ activeSite }) {
  const { t } = useT();
  const [content, setContent] = useState('');
  const [loadedContent, setLoadedContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState({ text: '', isError: false });

  useEffect(() => {
    let cancelled = false;
    if (!activeSite?.id) return undefined;

    setIsLoading(true);
    setLoadFailed(false);
    setMessage({ text: '', isError: false });
    readAdditionalInfo(activeSite).then((result) => {
      if (cancelled) return;
      setIsLoading(false);
      // An empty box after a failed read looks exactly like "you have not
      // written anything yet" — and Save would then replace everything the
      // owner actually has with whatever they type into it. Say what
      // happened and keep the editor locked instead.
      if (!result.ok) {
        setLoadFailed(true);
        setMessage({ text: result.error, isError: true });
        return;
      }
      setContent(result.text);
      setLoadedContent(result.text);
    });

    return () => { cancelled = true; };
  }, [activeSite?.id]);

  const isDirty = content !== loadedContent;

  const handleSave = async () => {
    setIsSaving(true);
    setMessage({ text: '', isError: false });
    const result = await saveAdditionalInfo(activeSite, content);
    setIsSaving(false);
    if (!result.ok) {
      setMessage({ text: result.error, isError: true });
      return;
    }
    setLoadedContent(content);
    setMessage({ text: t('Saved — your assistant can use this now.'), isError: false });
  };

  return (
    <div className="bg-surface-100 p-5 sm:p-6 rounded-xl border border-dark-900/5 space-y-4">
      <div>
        <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2">
          <NotebookPen className="w-4 h-4 text-brand-600" /> {t('Additional Information')}
        </h4>
        <p className="text-xs text-gray-500 mt-1">
          {t("Anything your assistant should know that isn't written on your website. Answers you add from the Conversations page land here too. Separate each piece of information with a blank line.")}
        </p>
      </div>

      <textarea
        value={isLoading ? '' : content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isLoading || loadFailed || !activeSite?.id}
        rows={8}
        placeholder={isLoading ? t('Loading…') : t('e.g. We deliver to the South Shore on Tuesdays and Thursdays.\n\nOur workshop is closed for two weeks at the end of July.')}
        className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-dark-900 placeholder-gray-400 outline-none focus:border-brand-500 resize-y disabled:opacity-60"
      />

      <div className="flex items-center justify-between gap-3">
        {message.text ? (
          <span className={`text-xs font-medium flex items-center gap-1.5 ${message.isError ? 'text-rose-600' : 'text-emerald-700'}`}>
            {!message.isError && <Check className="w-3.5 h-3.5" />}
            {message.text}
          </span>
        ) : <span />}

        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving || isLoading || loadFailed}
          className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isSaving ? t('Saving…') : t('Save')}
        </button>
      </div>
    </div>
  );
}

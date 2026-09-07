import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import api from '../../../lib/api';

// Website Summary State & Handlers
export default function useSiteSummary(activeSite) {
  const [siteSummary, setSiteSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const [summarySuccessMsg, setSummarySuccessMsg] = useState('');
  const [showSummaryEditor, setShowSummaryEditor] = useState(false);

  const fetchSiteSummary = async () => {
    if (!activeSite?.id) return;
    setIsLoadingSummary(true);
    try {
      const { data: sumData } = await supabase
        .from('site_summaries')
        .select('summary')
        .eq('site_id', activeSite.id)
        .maybeSingle();

      if (sumData?.summary) {
        setSiteSummary(sumData.summary);
        setIsLoadingSummary(false);
        return;
      }

      const { data: docData } = await supabase
        .from('documents')
        .select('content')
        .eq('site_id', activeSite.id)
        .ilike('url', '%#site-summary')
        .maybeSingle();

      if (docData?.content) {
        setSiteSummary(docData.content.replace(/^\[SITE_SUMMARY\]\n/, ''));
        setIsLoadingSummary(false);
        return;
      }

      if (activeSite?.domain) {
        setIsRegeneratingSummary(true);
        const summaryRes = await api.crawler.summarize({
          tenant_id: activeSite.tenant_id,
          site_id: activeSite.id,
          url: activeSite.domain
        });

        if (summaryRes.ok && summaryRes.data?.summary) {
          setSiteSummary(summaryRes.data.summary);
        }
      }
    } catch (err) {
      console.error('[fetchSiteSummary] Error:', err);
    } finally {
      setIsLoadingSummary(false);
      setIsRegeneratingSummary(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!activeSite?.id || !siteSummary.trim()) return;
    setIsSavingSummary(true);
    try {
      await supabase.from('site_summaries').upsert({
        tenant_id: activeSite.tenant_id,
        site_id: activeSite.id,
        summary: siteSummary.trim(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,site_id' });

      // Fallback document sync
      const summaryUrl = `https://${activeSite.domain}#site-summary`;
      await supabase.from('documents').delete().eq('site_id', activeSite.id).eq('url', summaryUrl);
      await supabase.from('documents').insert({
        tenant_id: activeSite.tenant_id,
        site_id: activeSite.id,
        url: summaryUrl,
        content: `[SITE_SUMMARY]\n${siteSummary.trim()}`
      });

      setSummarySuccessMsg('✓ Business summary saved successfully!');
      setTimeout(() => setSummarySuccessMsg(''), 3500);
    } catch (err) {
      console.error('[handleSaveSummary] Error:', err);
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleRegenerateSummary = async () => {
    if (!activeSite?.id || isRegeneratingSummary) return;
    setIsRegeneratingSummary(true);
    try {
      const res = await api.crawler.summarize({
        tenant_id: activeSite.tenant_id,
        site_id: activeSite.id,
        url: activeSite.domain
      });

      if (res.ok && res.data?.summary) {
        setSiteSummary(res.data.summary);
        setSummarySuccessMsg('✓ AI Business Summary regenerated successfully!');
        setTimeout(() => setSummarySuccessMsg(''), 3500);
      }
    } catch (err) {
      console.error('[handleRegenerateSummary] Error:', err);
    } finally {
      setIsRegeneratingSummary(false);
    }
  };

  return {
    siteSummary,
    setSiteSummary,
    isLoadingSummary,
    isSavingSummary,
    isRegeneratingSummary,
    setIsRegeneratingSummary,
    summarySuccessMsg,
    showSummaryEditor,
    setShowSummaryEditor,
    fetchSiteSummary,
    handleSaveSummary,
    handleRegenerateSummary
  };
}

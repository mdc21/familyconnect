(function () {
    const queueEl = document.getElementById('queue-container');
    const detailEl = document.getElementById('detail-panel');
    const caseLayout = document.getElementById('case-layout');
    const newsSection = document.getElementById('news-section');
    const newsPanel = document.getElementById('news-panel');

    const tabTriage = document.getElementById('tab-triage');
    const tabEvidence = document.getElementById('tab-evidence');
    const tabSafeguarding = document.getElementById('tab-safeguarding');
    const tabDisputes = document.getElementById('tab-disputes');
    const tabNews = document.getElementById('tab-news');

    
    let selectedCase = null;

    function setActiveTab(activeBtn) {
        [tabTriage, tabEvidence, tabSafeguarding, tabDisputes, tabNews].forEach(b => {
            if (b) b.classList.remove('active');
        });
        if (activeBtn) activeBtn.classList.add('active');

        if (activeBtn === tabNews) {
            if (caseLayout) caseLayout.style.display = 'none';
            if (newsSection) newsSection.style.display = 'block';
            loadNewsHub();
        } else {
            if (caseLayout) caseLayout.style.display = 'grid';
            if (newsSection) newsSection.style.display = 'none';
        }
    }

    if (tabTriage) tabTriage.onclick = () => setActiveTab(tabTriage);
    if (tabEvidence) tabEvidence.onclick = () => setActiveTab(tabEvidence);
    if (tabSafeguarding) tabSafeguarding.onclick = () => setActiveTab(tabSafeguarding);
    if (tabDisputes) tabDisputes.onclick = () => setActiveTab(tabDisputes);
    if (tabNews) tabNews.onclick = () => setActiveTab(tabNews);

    async function loadActiveCases() {
        try {
            queueEl.innerHTML = `
        <li class="cw-queue-item" onclick="loadCaseDetails('FC-NP-2026-00892')">
          <span class="ref">FC-NP-2026-00892</span>
          <span class="meta">Sunita Sharma — SEARCH_ACTIVE</span>
        </li>
      `;
        } catch (err) {
            queueEl.innerHTML = `<li class="cw-queue-item error">Failed to load queue.</li>`;
        }
    }

    window.loadCaseDetails = async function (caseRef) {
        detailEl.innerHTML = `<p class="hint">Loading case ${caseRef}...</p>`;
        try {
            const res = await fetch(`${window.FC_API_BASE || ''}/api/v1/cases/${caseRef}`, { headers: { ...authHeader(), 'Content-Type': 'application/json' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            selectedCase = await res.json();
            renderCaseDetail(selectedCase);
        } catch (err) {
            detailEl.innerHTML = `<p class="error">Failed to load case: ${err.message}</p>`;
        }
    };

    function renderCaseDetail(c) {
        detailEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div>
          <h2>${c.case_reference}</h2>
          <p><strong>Person:</strong> ${c.person ? (c.person.first_name + ' ' + c.person.last_name) : 'Unknown'}</p>
        </div>
        <div>
          <span class="cw-badge cw-badge-active">${c.status}</span>
          <span class="cw-badge cw-badge-p1">${c.priority || 'P2'}</span>
        </div>
      </div>

      <hr style="margin: 1rem 0; border: 0; border-top: 1px solid var(--border-subtle);">

      <h3>State Transitions (SPEC-003 §4)</h3>
      <div class="cw-actions-grid">
        <div class="action-box">
          <h4>Confirm Safety</h4>
          <p class="hint">Transition case to SAFE_CONFIRMED.</p>
          <button class="btn btn-primary" onclick="executeAction('${c.case_reference}', 'confirm-safety')">Confirm Safe</button>
        </div>
        <div class="action-box">
          <h4>Mark Hospitalised</h4>
          <p class="hint">Link hospital encounter status.</p>
          <button class="btn" onclick="executeAction('${c.case_reference}', 'mark-hospitalised')">Hospitalise</button>
        </div>
        <div class="action-box">
          <h4>Intake Evidence</h4>
          <p class="hint">Add descriptors / photo references.</p>
          <button class="btn" onclick="addEvidencePrompt('${c.case_reference}')">Attach Evidence</button>
        </div>
      </div>
    `;
    }

    window.executeAction = async function (caseRef, action) {
        if (!confirm(`Execute action: ${action} on case ${caseRef}?`)) return;
        try {
            const res = await fetch(`${window.FC_API_BASE || ''}/api/v1/cases/${caseRef}/actions/${action}`, {
                method: 'POST',
                headers: {
                    ...{ ...authHeader(), 'Content-Type': 'application/json' },
                    'Idempotency-Key': (crypto.randomUUID ? crypto.randomUUID() : ('key-' + Date.now()))
                },
                body: JSON.stringify({ notes: `Action executed from console by cw-console-1` })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Action failed');
            alert(`Status updated to: ${data.status || 'Success'}`);
            loadCaseDetails(caseRef);
        } catch (err) {
            alert('Action error: ' + err.message);
        }
    };

    window.addEvidencePrompt = async function (caseRef) {
        const desc = prompt('Enter distinguishing physical descriptors (e.g. Scars, clothing):');
        if (!desc) return;
        try {
            const res = await fetch(`${window.FC_API_BASE || ''}/api/v1/cases/${caseRef}/evidence`, {
                method: 'POST',
                headers: {
                    ...{ ...authHeader(), 'Content-Type': 'application/json' },
                    'Idempotency-Key': (crypto.randomUUID ? crypto.randomUUID() : ('key-' + Date.now()))
                },
                body: JSON.stringify({
                    evidence_type: 'PHYSICAL_DESCRIPTOR',
                    description: desc,
                    verification_status: 'PARTIALLY_VERIFIED'
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to attach evidence');
            alert('Evidence attached successfully');
        } catch (err) {
            alert('Error attaching evidence: ' + err.message);
        }
    };

    // ── AI NEWS AGENT & VERIFICATION HUB ──
    async function loadNewsHub() {
        newsPanel.innerHTML = '<p class="hint">Loading AI News Agent status and pending queue...</p>';
        try {
            const [sched, queue] = await Promise.all([
                api.getNewsSchedule(),
                api.getNewsQueue('PENDING_REVIEW')
            ]);
            renderNewsHub(sched, queue);
        } catch (err) {
            newsPanel.innerHTML = `<p class="error">Failed to load AI News Hub: ${err.message}</p>`;
        }
    }

    function renderNewsHub(sched, queue) {
        const isWeek1 = sched.currentPhase === 'WEEK_1';
        newsPanel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1rem;">
                <div>
                    <h2 style="margin:0;">AI News Agent &amp; Information Verification Hub</h2>
                    <p style="margin:0.25rem 0 0; color:var(--text-muted); font-size:0.9rem;">
                        Autonomous news crawler for <strong>Nepal–Tibet Border GLOF Event</strong>. Human verification required before public broadcast.
                    </p>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <button class="btn btn-primary" onclick="triggerNewsAgentRun()">Run AI News Collector Now</button>
                    <button class="btn btn-outline" onclick="toggleScheduleMode('${sched.currentPhase}')">
                        Schedule: ${isWeek1 ? '1st Week (6-Hr Cycle)' : 'Weeks 2–5 (24-Hr Daily)'}
                    </button>
                </div>
            </div>

            <div style="background:#f8fafc; border:1px solid var(--border-subtle); padding:0.85rem 1rem; border-radius:4px; font-size:0.85rem; margin-bottom:1.25rem; display:flex; gap:1.5rem; flex-wrap:wrap;">
                <span><strong>Agent Schedule Phase:</strong> ${sched.currentPhase === 'WEEK_1' ? 'Week 1 (Active Response — 6h)' : 'Weeks 2–5 (Daily — 24h)'}</span>
                <span><strong>Interval:</strong> Every ${sched.intervalHours} hours</span>
                <span><strong>Last Crawl:</strong> ${sched.lastRunAt ? new Date(sched.lastRunAt).toLocaleString() : 'Not run yet'}</span>
                <span><strong>Next Crawl:</strong> ${sched.nextRunAt ? new Date(sched.nextRunAt).toLocaleString() : 'Pending'}</span>
                <span><strong>Total Ingested:</strong> ${sched.itemsIngestedCount || 0} items</span>
            </div>

            <h3>Pending AI News Queue (${queue.length} items awaiting human review)</h3>
            ${queue.length === 0 ? '<p class="hint">Queue is empty. Click <strong>Run AI News Collector Now</strong> to ingest updates from trusted sources.</p>' : ''}
            
            <div style="display:grid; gap:1rem; margin-top:1rem;">
                ${queue.map(item => `
                    <div style="border:1px solid var(--border-subtle); background:#fff; padding:1.25rem; border-left:4px solid ${item.credibilityScore >= 0.9 ? '#10b981' : '#f59e0b'};">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:0.5rem;">
                            <h4 style="margin:0; font-size:1.05rem; color:var(--text-main);">${escapeHtml(item.title)}</h4>
                            <span style="background:${item.credibilityScore >= 0.9 ? '#dcfce7; color:#15803d;' : '#fef3c7; color:#92400e;'}; font-size:0.75rem; font-weight:700; padding:0.2rem 0.5rem; border-radius:3px;">
                                Score: ${(item.credibilityScore * 100).toFixed(0)}%
                            </span>
                        </div>
                        <p style="font-size:0.9rem; line-height:1.6; color:var(--text-main); margin-bottom:0.75rem;">${escapeHtml(item.summary)}</p>
                        <div style="font-size:0.8rem; color:var(--text-muted); display:flex; gap:1.25rem; flex-wrap:wrap; margin-bottom:1rem;">
                            <span>Source: <strong>${escapeHtml(item.sourceName)}</strong> (${escapeHtml(item.sourceType)})</span>
                            <span>Category: <strong>${escapeHtml(item.category)}</strong></span>
                            <span>Fetched: ${new Date(item.fetchedAt).toLocaleString()}</span>
                            ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">Citation Link →</a>` : ''}
                        </div>
                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; border-top:1px solid var(--border-subtle); padding-top:0.75rem;">
                            <button class="btn btn-primary" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="reviewNews('${item.newsId}', 'PUBLISH_VERIFIED')">Approve &amp; Publish VERIFIED</button>
                            <button class="btn btn-outline" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="reviewNews('${item.newsId}', 'PUBLISH_UNVERIFIED')">Publish UNVERIFIED Broadcast</button>
                            <button class="btn" style="font-size:0.8rem; padding:0.35rem 0.75rem; background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;" onclick="reviewNewsAsRumour('${item.newsId}')">Flag as Rumour / Fake News</button>
                            <button class="btn" style="font-size:0.8rem; padding:0.35rem 0.75rem;" onclick="reviewNews('${item.newsId}', 'REJECT')">Reject &amp; Archive</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    window.triggerNewsAgentRun = async function () {
        try {
            newsPanel.innerHTML = '<p class="hint">Running AI News Agent collector across trusted disaster feeds...</p>';
            const res = await api.runNewsAgent();
            alert(res.message);
            loadNewsHub();
        } catch (err) {
            alert('AI Agent error: ' + err.message);
            loadNewsHub();
        }
    };

    window.toggleScheduleMode = async function (currentPhase) {
        const nextPhase = currentPhase === 'WEEK_1' ? 'WEEKS_2_TO_5' : 'WEEK_1';
        const intervalHours = nextPhase === 'WEEK_1' ? 6 : 24;
        try {
            const res = await api.updateNewsSchedule({ currentPhase: nextPhase, intervalHours });
            alert(res.message);
            loadNewsHub();
        } catch (err) {
            alert('Schedule error: ' + err.message);
        }
    };

    window.reviewNews = async function (newsId, action) {
        if (!confirm(`Execute action ${action} on this AI news item?`)) return;
        try {
            const res = await api.reviewNewsItem(newsId, { action });
            alert(res.message);
            loadNewsHub();
        } catch (err) {
            alert('Review error: ' + err.message);
        }
    };

    window.reviewNewsAsRumour = async function (newsId) {
        const status = prompt('Select rumour status (FALSE or MISLEADING):', 'FALSE');
        if (!status || !['FALSE', 'MISLEADING'].includes(status.toUpperCase())) {
            alert('Cancelled or invalid status. Must be FALSE or MISLEADING.');
            return;
        }
        const message = prompt('Enter official authority debunking statement / clarification:');
        if (!message) return;

        try {
            const res = await api.reviewNewsItem(newsId, {
                action: 'PUBLISH_RUMOUR',
                verificationStatus: status.toUpperCase(),
                responseMessage: message
            });
            alert(res.message);
            loadNewsHub();
        } catch (err) {
            alert('Review error: ' + err.message);
        }
    };

    loadActiveCases();
})();
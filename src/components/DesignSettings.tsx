{/* Community Section */}
        <Section title="Community Section (social links)">
          <p className="text-xs text-zinc-500">Add your social platforms. Shows as a row of icon buttons on the landing page. Leave empty to hide the section.</p>
          <Row label="Section heading"><input className={inputCls} value={form.communityTitle} onChange={(e) => set('communityTitle', e.target.value)} placeholder="Join our community" /></Row>
          <Row label="Subtext"><textarea className={inputCls} rows={2} value={form.communitySubtext} onChange={(e) => set('communitySubtext', e.target.value)} /></Row>
          <div className="space-y-2 pt-1">
            {community.map((c, i) => (
              <div key={i} className="bg-zinc-50 rounded-lg p-3 border border-zinc-100 space-y-2">
                <div className="flex items-center gap-2">
                  <select className={inputCls + ' w-32'} value={c.icon} onChange={(e) => updateCommunity(i, 'icon', e.target.value)}>
                    {SOCIAL_ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                  </select>
                  <input className={inputCls + ' flex-1'} value={c.platform} onChange={(e) => updateCommunity(i, 'platform', e.target.value)} placeholder="Platform name (e.g. Instagram)" />
                  <button onClick={() => moveCommunity(i, -1)} disabled={i === 0} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => moveCommunity(i, 1)} disabled={i === community.length - 1} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  <button onClick={() => removeCommunity(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <input className={inputCls} value={c.handle || ''} onChange={(e) => updateCommunity(i, 'handle', e.target.value)} placeholder="Handle (optional, e.g. @teckosh)" />
                  <input className={inputCls} value={c.url} onChange={(e) => updateCommunity(i, 'url', e.target.value)} placeholder="https://..." />
                </div>
              </div>
            ))}
            <button onClick={addCommunity} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:underline"><Plus className="w-4 h-4" /> Add Social Link</button>
          </div>
        </Section>
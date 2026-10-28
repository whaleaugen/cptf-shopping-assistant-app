async function cppSync() {
  const EVENT_ID = 7940;
  const KNOWN_TYPES = '36,37,38,39,40,50,51,52';
  if (!/(^|\.)allcpp\.cn$/i.test(location.hostname)) {
    alert('请先打开 www.allcpp.cn 的 CPTF 活动页面，再点击这个书签。');
    return;
  }
  if (document.getElementById('cptf-sync-panel')) {
    alert('同步已经在进行中。');
    return;
  }
  const panel = document.createElement('div');
  panel.id = 'cptf-sync-panel';
  panel.style.cssText = 'position:fixed;z-index:2147483647;right:18px;top:18px;width:270px;padding:16px 18px;border-radius:14px;background:#24211f;color:#fff;box-shadow:0 16px 45px rgba(0,0,0,.3);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif';
  panel.innerHTML = '<b style="display:block;margin-bottom:5px">CPTF 图片同步</b><span id="cptf-sync-text">正在连接 CPP…</span>';
  document.body.appendChild(panel);
  const message = panel.querySelector('#cptf-sync-text');
  const imageUrl = value => {
    if (!value) return '';
    const base = /^https?:\/\//i.test(value) ? value : `https://imagecdn3.allcpp.cn/upload/${String(value).replace(/^\//, '')}`;
    return base.includes('?') ? base : `${base}?x-oss-process=style/rectangle_450-600_60`;
  };
  try {
    const readPage = async (typeIds, page) => {
      const params = new URLSearchParams({ eventId: String(EVENT_ID), keyword: '', orderBy: '0', typeIds, pageIndex: String(page), pageSize: '100', sellStatus: '', ideaStatus: '', tag: '' });
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await fetch(`/api/doujinshi/search.do?${params}`, { credentials: 'include', redirect: 'follow', headers: { errorWrap: 'json' } });
          if (!response.ok || /login/i.test(response.url)) throw new Error('LOGIN');
          let envelope;
          try { envelope = JSON.parse(await response.text()); } catch (_) { throw new Error('LOGIN'); }
          const data = envelope && envelope.isSuccess && envelope.result ? envelope.result : envelope;
          if (!data || !Array.isArray(data.list)) throw new Error(envelope && envelope.message ? envelope.message : 'FORMAT');
          return data;
        } catch (error) {
          lastError = error;
          if (error.message === 'LOGIN') throw error;
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
        }
      }
      throw lastError;
    };
    message.textContent = '正在检测 CPP 的完整数据范围…';
    const probes = [];
    for (const candidate of ['', KNOWN_TYPES]) {
      try {
        const data = await readPage(candidate, 1);
        probes.push({ typeIds: candidate, data, total: Number(data.total) || data.list.length });
      } catch (error) {
        if (error.message === 'LOGIN') throw error;
      }
    }
    if (!probes.length) throw new Error('FORMAT');
    probes.sort((a, b) => b.total - a.total);
    const chosen = probes[0];
    const all = [...chosen.data.list];
    const total = chosen.total;
    let page = 2;
    while (all.length < total && page <= 500) {
      message.textContent = `接口报告 ${total} 件 · 正在读取第 ${page} 页 · 已获取 ${all.length} 件…`;
      const data = await readPage(chosen.typeIds, page);
      if (!data.list.length) break;
      all.push(...data.list);
      page += 1;
    }
    const unique = [...new Map(all.map(item => [String(item.doujinshiId || `${item.doujinshiName}-${item.circleName}`), item])).values()];
    const items = unique.map(item => {
      const event = (item.eventList || []).find(entry => Number(entry.eventID) === EVENT_ID) || {};
      return {
        cppId: String(item.doujinshiId || ''),
        booth: event.position || '',
        name: item.doujinshiName || '',
        coverUrl: imageUrl(item.coverPicUrl),
        author: (item.authorList || []).map(author => author.authorName || author.authorId).filter(Boolean).join(' / '),
        circle: item.circleName || '',
        heat: Number(item.hotCount) || 0,
        type: item.type || '',
        description: ''
      };
    });
    const typeCounts = items.reduce((counts, item) => { const key = item.type || '未分类'; counts[key] = (counts[key] || 0) + 1; return counts; }, {});
    const payload = { eventId: 7166, exhibitId: EVENT_ID, eventName: 'COMICUP CITYTOUR FU', syncedAt: new Date().toISOString(), syncReport: { reportedTotal: total, fetchedRows: all.length, uniqueItems: items.length, queryMode: chosen.typeIds ? 'known-types' : 'all-types', complete: all.length >= total, typeCounts }, items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'CPTF-CPP-images.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    message.textContent = all.length >= total ? `完整性检查通过：接口报告 ${total} 件，已导出 ${items.length} 件唯一展品。` : `注意：接口报告 ${total} 件，只读取到 ${all.length} 件，请稍后重试。`;
    panel.style.background = all.length >= total ? '#53675a' : '#9a6a35';
    setTimeout(() => panel.remove(), 12000);
  } catch (error) {
    console.error('[CPTF sync]', error);
    message.textContent = error.message === 'LOGIN' ? '没有取得 JSON。请确认已经登录 CPP，并在活动页重试。' : `同步失败：${error.message || '接口返回异常'}`;
    panel.style.background = '#8f4b45';
    setTimeout(() => panel.remove(), 10000);
  }
}

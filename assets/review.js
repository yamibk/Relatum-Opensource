(function () {
  'use strict';

  const root = document.querySelector('[data-role="review-view"]');
  if (!root) return;

  const SYSTEM_QUESTIONS = [
    '你还记得这个节点在讲什么吗？',
    '它的现象、原理是什么？',
    '你还记得这个公式的推导或本质吗？',
  ];
  const KIND_LABEL = {
    index: '索引',
    preview: '预览',
    card: '卡片',
    sticky: '便签',
    code: '代码',
  };
  const DAILY_KEY = 'review:daily';
  const PRAISE = {
    remembered: ['记得 ✦ 间隔又拉长一点', '记得 ✦ 这一下接得更牢', '记得 ✦ 稳了'],
    vague: ['模糊也没关系，过两天再见', '模糊 ✦ 留个印象就好', '模糊 ✦ 下次会更近一点'],
    forgot: ['不会很正常，今天会再练一次', '没接上？再来一遍就好', '忘了也是一次复习，别急'],
  };

  const emptyEl = root.querySelector('[data-role="review-empty"]');
  const contentEl = root.querySelector('[data-role="review-content"]');
  const totalEl = root.querySelector('[data-role="review-total"]');   // 待复习（今天到期）
  const seenEl = root.querySelector('[data-role="review-seen"]');     // 今日复习（已做）
  const canvasEl = root.querySelector('[data-role="review-canvas"]');
  const kindEl = root.querySelector('[data-role="review-kind"]');
  const maturityEl = root.querySelector('[data-role="review-maturity"]');
  const titleEl = root.querySelector('[data-role="review-title"]');
  const bodyEl = root.querySelector('[data-role="review-body"]');
  const questionEl = root.querySelector('[data-role="review-question"]');
  const answerEl = root.querySelector('[data-role="review-answer"]');
  const answerPillEl = root.querySelector('[data-role="review-answer-pill"]');
  const answerRevealEl = root.querySelector('[data-role="review-answer-reveal"]');

  let pool = [];
  let current = null;
  let currentQuestions = [];
  let currentCustomCount = 0;   // 当前卡的自定义问题数量（排在 currentQuestions 最前），有则优先展示
  let questionIndex = 0;
  let reviewedToday = 0;
  let loading = false;
  let celebratePulse = false;   // 仅「刚标记完、当前没到期的了」放庆祝；冷启动只显示文案不放动画
  let allCards = [];            // 本次加载的完整复习集（不随评分删减），自由漫游从这里随机抽
  let roaming = false;          // 自由漫游：随机无限抽，不写调度、不计进度
  let mathQueue = Promise.resolve();   // 公式排版串行队列（与编辑器同套：clear→reset→typeset）
  const pendingMathElements = new Set();
  let mathReadyTimer = 0;
  let mathReadyTries = 0;
  let mathLoadHandle = 0;
  let mathLoadUsesIdle = false;

  // —— 今日复习计数：存 localStorage，刷新不丢；日期一变（跨天）自动归零 ——
  function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function loadDaily() {
    try {
      const raw = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
      if (raw && raw.date === todayStr() && Number.isFinite(raw.count)) return raw.count;
    } catch (e) {}
    return 0;
  }
  function saveDaily() {
    try {
      localStorage.setItem(DAILY_KEY, JSON.stringify({ date: todayStr(), count: reviewedToday }));
    } catch (e) {}
  }

  function toast(message) {
    const el = document.querySelector('[data-role="study-toast"]') || document.querySelector('[data-role="toast"]');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function post(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }).then((resp) => resp.json().then((json) => {
      if (!resp.ok) throw new Error((json && json.error) || '请求失败');
      return json;
    }));
  }

  // —— 正文 / 答案富渲染：Markdown + 公式，和编辑器同一套引擎 ——
  // MathJax 在起步页是按需懒加载的（只有进复习页才拉这份本地包）；config 必须先于脚本设好，
  // 排版走串行队列，未就绪时等加载完再补排一次。
  function ensureMathJax() {
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') return;
    if (document.querySelector('script[data-review-mathjax]') || mathLoadHandle) return;
    if (!window.MathJax || typeof window.MathJax !== 'object') {
      window.MathJax = {
        tex: {
          inlineMath: [['$', '$'], ['\\(', '\\)']],
          displayMath: [['$$', '$$'], ['\\[', '\\]']],
          processEscapes: true,
          tags: 'ams',
        },
        startup: { typeset: false },
      };
    }
    const load = function () {
      mathLoadHandle = 0;
      if (document.querySelector('script[data-review-mathjax]')) return;
      const script = document.createElement('script');
      script.src = 'vendor/mathjax/tex-mml-chtml.js';
      script.async = true;
      script.dataset.reviewMathjax = '1';
      script.addEventListener('error', function () { console.warn('[复习] MathJax 加载失败'); });
      document.head.appendChild(script);
    };
    mathLoadUsesIdle = typeof window.requestIdleCallback === 'function';
    mathLoadHandle = mathLoadUsesIdle
      ? window.requestIdleCallback(load, { timeout: 1200 })
      : window.setTimeout(load, 200);
  }

  function cancelMathLoadSchedule() {
    if (!mathLoadHandle) return;
    if (mathLoadUsesIdle && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(mathLoadHandle);
    } else {
      window.clearTimeout(mathLoadHandle);
    }
    mathLoadHandle = 0;
  }

  function queueWhenMathReady(el) {
    pendingMathElements.add(el);
    if (mathReadyTimer) return;
    const poll = function () {
      mathReadyTimer = 0;
      if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
        const elements = Array.from(pendingMathElements);
        pendingMathElements.clear();
        mathReadyTries = 0;
        elements.forEach(function (pending) {
          if (pending && pending.isConnected) typeset(pending);
        });
        return;
      }
      if (mathReadyTries++ >= 60) {
        pendingMathElements.clear();
        mathReadyTries = 0;
        return;
      }
      mathReadyTimer = window.setTimeout(poll, 150);
    };
    poll();
  }

  function cancelMathReadyWait() {
    if (mathReadyTimer) window.clearTimeout(mathReadyTimer);
    mathReadyTimer = 0;
    mathReadyTries = 0;
    pendingMathElements.clear();
  }

  function typeset(el) {
    if (!el) return;
    const mj = window.MathJax;
    if (!mj || typeof mj.typesetPromise !== 'function') {
      ensureMathJax();
      queueWhenMathReady(el);   // 同一容器只排一次；加载失败后停止轮询，不留下永久 interval
      return;
    }
    mathQueue = mathQueue.then(function () {
      try {
        if (typeof mj.typesetClear === 'function') mj.typesetClear([el]);
        if (typeof mj.texReset === 'function') mj.texReset();
      } catch (e) {}
      return mj.typesetPromise([el]);
    }).catch(function () {});
  }

  function hasMathSource(text) {
    // 与画布正文的判据保持一致：除了常规分隔符，还要覆盖裸 equation/align
    // 环境及跨节点公式引用；否则复习卡里的自动编号公式不会触发 MathJax 懒加载。
    return /(?:\$|\\\(|\\\[|\\begin\{|\\ref\{|\\eqref\{)/.test(text || '');
  }

  // 把一段正文/答案渲染成 Markdown + 公式；空内容返回 false，调用方据此隐藏容器。
  function renderRich(el, src, kind) {
    if (!el) return false;
    const text = String(src == null ? '' : src);
    // 换内容前先清掉容器里上一张卡的 MathJax 痕迹：必须赶在 innerHTML 覆盖之前——
    // 一旦覆盖，旧公式节点就脱离 DOM，typesetClear 再也找不到它们，MathJax 内部数学
    // 列表只增不减 → 翻卡越多越占内存、越用越卡。这里赶在旧 mjx 还在 DOM 时清掉。
    const mj = window.MathJax;
    if (mj && typeof mj.typesetClear === 'function') {
      try { mj.typesetClear([el]); } catch (e) {}
    }
    if (!text.trim()) { el.innerHTML = ''; return false; }
    if (kind === 'code') {
      // 代码节点：原样等宽显示，绝不走 Markdown / MathJax（与画布一致）
      el.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'review-body-code';
      pre.textContent = text;
      el.appendChild(pre);
      return true;
    }
    if (window.MarkdownMini && typeof window.MarkdownMini.render === 'function') {
      el.innerHTML = window.MarkdownMini.render(text);
    } else {
      el.textContent = text;
    }
    if (hasMathSource(text)) typeset(el);
    if (window.MermaidRenderer) window.MermaidRenderer.renderAll(el);
    return true;
  }

  // 重新触发一次 CSS 动画：移类 → 强制回流 → 加类
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // 提交反馈：在「今日复习」数字旁冒一个「+1」上浮
  function floatPlusOne() {
    if (!seenEl || !seenEl.parentElement) return;
    const chip = document.createElement('span');
    chip.className = 'review-plus-one';
    chip.textContent = '+1';
    seenEl.parentElement.appendChild(chip);
    setTimeout(() => chip.remove(), 950);
  }

  // 提交反馈：一句温和的话；写了答案就先夸一句「写下来了」
  function praise(rating, wrote) {
    const lines = PRAISE[rating] || ['已记录'];
    let msg = lines[Math.floor(Math.random() * lines.length)];
    if (wrote) msg = '写下来了 ✦ ' + msg;
    toast(msg);
  }

  // 到期判定：从没复习过（无 due）= 立即到期；否则按 ISO 日期字符串直接比大小
  function isDue(card) {
    if (!card) return false;
    if (!card.due) return true;
    return card.due <= todayStr();
  }
  function dueCards() {
    return pool.filter(isDue);
  }

  function buildQuestions(card) {
    const custom = Array.isArray(card.questions)
      ? card.questions.map((q) => String(q || '').trim()).filter(Boolean)
      : [];
    currentCustomCount = custom.length;   // 记下自定义问题数量，渲染时优先从这段起步
    return custom.concat(SYSTEM_QUESTIONS);
  }

  function updateStats() {
    if (totalEl) totalEl.textContent = String(dueCards().length);
    if (seenEl) seenEl.textContent = String(reviewedToday);
  }

  // 「查看答案」实际内容：优先用编辑模式里写的 review.answer；
  // 预览节点若没单独写答案，则用它的正文兜底（与“悬停才展开”一致——正文就是藏起来的答案）；
  // 预览节点连正文都没有，则返回空＝不显示「查看答案」胶囊，保持现状。
  function effectiveAnswer(card) {
    if (!card) return '';
    if (typeof card.answer === 'string' && card.answer.trim()) return card.answer;
    if (card.kind === 'preview' && typeof card.body === 'string' && card.body.trim()) return card.body;
    return '';
  }

  // 参考答案：每张卡进来先收起；有答案才显示「查看答案」绿胶囊
  function resetAnswerReveal(card) {
    const hasAnswer = !!effectiveAnswer(card).trim();
    if (answerPillEl) {
      answerPillEl.hidden = !hasAnswer;
      answerPillEl.textContent = '查看答案';
    }
    if (answerRevealEl) {
      answerRevealEl.hidden = true;
      answerRevealEl.textContent = '';
    }
  }
  function toggleAnswer() {
    if (!current || !answerRevealEl || !answerPillEl) return;
    const ans = effectiveAnswer(current).trim();
    if (!ans) return;
    if (answerRevealEl.hidden) {
      renderRich(answerRevealEl, ans, '');   // 答案按正文渲染：Markdown + 公式
      answerRevealEl.hidden = false;
      replay(answerRevealEl, 'reveal-in');
      answerPillEl.textContent = '收起答案';
    } else {
      answerRevealEl.hidden = true;
      answerPillEl.textContent = '查看答案';
    }
  }

  function renderEmpty() {
    emptyEl.hidden = false;
    const roamBtn = allCards.length
      ? '<button type="button" class="review-roam-cta" data-action="review-roam-start">继续自由复习 →</button>'
      : '';
    if (reviewedToday > 0) {
      // 今天做过复习、当前没有到期的了 → 庆祝一下
      const spark = celebratePulse
        ? '<div class="review-spark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>'
        : '';
      emptyEl.classList.add('celebrate');
      emptyEl.innerHTML = spark
        + '<strong>今天的复习做完了</strong>'
        + '<span>今天复习了 ' + reviewedToday + ' 张 ✦ 想再练练就继续漫游，不计进度。</span>'
        + roamBtn;
      if (celebratePulse) replay(emptyEl, 'celebrate-in');
    } else if (allCards.length > 0) {
      // 有候选、但今天没有到期的
      emptyEl.classList.remove('celebrate');
      emptyEl.innerHTML = '<strong>今天没有到期的卡片</strong>'
        + '<span>都按计划复习过了。想随便翻翻就漫游一下，不影响进度。</span>'
        + roamBtn;
    } else {
      // 一张都还没加入复习
      emptyEl.classList.remove('celebrate');
      emptyEl.innerHTML = '<strong>还没有可复习节点</strong><span>在编辑模式里选中正文节点，勾选「加入复习卡片」即可。</span>';
    }
  }

  function renderCard(card) {
    current = card;
    updateStats();
    if (!card) {
      if (emptyEl) renderEmpty();
      if (contentEl) contentEl.hidden = true;
      return;
    }
    currentQuestions = buildQuestions(card);
    // 有自定义问题时优先展示自定义问题（只在自定义区间里起步；没有则在系统预设里随机）
    questionIndex = currentCustomCount > 0
      ? Math.floor(Math.random() * currentCustomCount)
      : Math.floor(Math.random() * currentQuestions.length);
    if (emptyEl) emptyEl.hidden = true;
    if (contentEl) contentEl.hidden = false;
    if (canvasEl) canvasEl.textContent = card.canvasName || '画布';
    if (kindEl) kindEl.textContent = KIND_LABEL[card.kind] || '节点';
    if (maturityEl) {
      maturityEl.textContent = card.maturity || '生';
      maturityEl.dataset.maturity = card.maturity || '生';
    }
    if (titleEl) titleEl.textContent = card.title || '未命名节点';
    if (bodyEl) {
      if (card.kind === 'preview') {
        // 预览节点的正文本就是「悬停才展开」的，复习时只留标题做提示，不展示正文
        bodyEl.innerHTML = '';
        bodyEl.hidden = true;
      } else {
        bodyEl.hidden = !renderRich(bodyEl, card.body, card.kind);
      }
    }
    if (questionEl) questionEl.textContent = currentQuestions[questionIndex] || SYSTEM_QUESTIONS[0];
    if (answerEl) answerEl.value = '';
    resetAnswerReveal(card);
    replay(contentEl, 'enter');
  }

  function nextCard() {
    const due = dueCards();
    renderCard(due.length ? due[Math.floor(Math.random() * due.length)] : null);
  }

  function rotateQuestion() {
    if (!currentQuestions.length) return;
    questionIndex = (questionIndex + 1) % currentQuestions.length;
    if (questionEl) {
      questionEl.textContent = currentQuestions[questionIndex];
      replay(questionEl, 'q-enter');
    }
  }

  async function loadPool(force) {
    reviewedToday = loadDaily();   // 每次进页面对齐今日计数（顺带处理跨天归零）
    if (loading) return false;
    if (pool.length && !force) {   // 已加载过且非强制：复用缓存，只抽下一张，不重新扫描全部画布
      nextCard();
      return true;
    }
    loading = true;
    try {
      const resp = await fetch('/api/review-pool');
      const json = await resp.json();
      if (!resp.ok) throw new Error((json && json.error) || '加载复习池失败');
      pool = Array.isArray(json.cards) ? json.cards : [];
      allCards = pool.slice();   // 漫游用的完整集合，不随评分删减
      nextCard();
      return true;
    } catch (err) {
      toast((err && err.message) || '加载复习池失败');
      renderCard(null);
      return false;
    } finally {
      loading = false;
    }
  }

  // 「更新」按钮：强制重新扫描复习池。默认翻进本页只复用上次缓存（秒开、不重读）；
  // 只有用户主动点更新，才真去后端重扫所有画布。
  async function refreshPool(btn) {
    if (loading) return;
    if (roaming) exitRoam();   // 漫游中点更新：先回正常复习态，再重新扫描
    if (btn) btn.classList.add('is-refreshing');
    try {
      const ok = await loadPool(true);
      if (ok) toast('复习池已更新');
    } finally {
      if (btn) btn.classList.remove('is-refreshing');
    }
  }

  async function mark(rating) {
    if (!current) return;
    const marked = current;
    const wrote = !!(answerEl && answerEl.value.trim());
    try {
      await post('/api/review-mark', {
        canvasPath: marked.canvasPath,
        nodeId: marked.nodeId,
        rating: rating,
      });
      reviewedToday += 1;
      saveDaily();
      if (seenEl) replay(seenEl, 'bump');
      floatPlusOne();
      praise(rating, wrote);
      // 本次会话不再重复抽到刚标记的卡（「不会」会在下次进页面时再到期）
      pool = pool.filter((item) => !(item.canvasPath === marked.canvasPath && item.nodeId === marked.nodeId));
      celebratePulse = true;
      nextCard();
      celebratePulse = false;
    } catch (err) {
      toast((err && err.message) || '标记失败');
    }
  }

  function openCurrent() {
    if (!current) return;
    window.location.href = 'editor.html?file=' + encodeURIComponent(current.canvasPath)
      + '&node=' + encodeURIComponent(current.nodeId);
  }

  // —— 自由漫游：做完当天复习后，从整份复习集里随机无限抽，纯练习、不写调度、不计进度 ——
  function enterRoam() {
    if (!allCards.length) return;
    roaming = true;
    root.dataset.roam = '1';
    nextRoamCard();
  }
  function exitRoam() {
    roaming = false;
    delete root.dataset.roam;
    celebratePulse = false;
    renderCard(null);   // 回到完成态（带「继续自由复习」入口）
  }
  function nextRoamCard() {
    if (!allCards.length) { exitRoam(); return; }
    let idx = Math.floor(Math.random() * allCards.length);
    // 避免连续抽到同一张（集合多于一张时）
    if (allCards.length > 1 && current
        && allCards[idx].nodeId === current.nodeId
        && allCards[idx].canvasPath === current.canvasPath) {
      idx = (idx + 1) % allCards.length;
    }
    renderCard(allCards[idx]);
  }

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    const action = btn && btn.dataset.action;
    if (!action) return;
    if (action === 'review-refresh') { refreshPool(btn); return; }
    if (action === 'review-roam-start') { enterRoam(); return; }
    if (action === 'review-exit-roam') { exitRoam(); return; }
    if (action === 'review-show-answer') { toggleAnswer(); return; }
    if (roaming) {
      // 漫游里评分按钮已隐藏；其余只是翻页/跳转，不写调度
      if (action === 'review-question') rotateQuestion();
      else if (action === 'review-open') openCurrent();
      else nextRoamCard();
      return;
    }
    if (action === 'review-next') nextCard();
    else if (action === 'review-question') rotateQuestion();
    else if (action === 'review-open') openCurrent();
    else if (action === 'review-remembered') mark('remembered');
    else if (action === 'review-vague') mark('vague');
    else if (action === 'review-forgot') mark('forgot');
  });

  window.CanvasReview = {
    activate: () => loadPool(false),
    reload: () => loadPool(true),
  };

  document.addEventListener('start:viewchange', (event) => {
    if (!event.detail || event.detail.current !== 'review') {
      cancelMathReadyWait();
      cancelMathLoadSchedule();
    }
  });
  window.addEventListener('pagehide', () => {
    cancelMathReadyWait();
    cancelMathLoadSchedule();
  });
})();

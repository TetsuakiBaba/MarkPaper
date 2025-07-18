// markpaper.js
// MarkPaper - Markdown to Clean Paper
// 自作の極小 Markdown パーサ & ローダー
(function () {
  // グローバルな図番号管理
  let globalFigureNum = 0;

  // --- 極小 Markdown → HTML 変換関数 ----------------------------
  function mdToHTML(md) {
    const lines = md.split(/\r?\n/);
    let html = '';
    let inUList = false;   // * の番号なしリスト
    let inOList = false;   // - の番号ありリスト

    // 章番号管理用の変数
    let chapterNum = 0;  // ## の番号
    let sectionNum = 0;  // ### の番号

    // 脚注管理用の変数
    let footnotes = {};  // 脚注の定義を保存
    let currentSectionFootnotes = [];  // 現在のセクションの脚注
    let currentSectionLevel = 0;  // 現在のセクションレベル (2=h2, 3=h3, etc.)

    // アラート処理用の変数
    let inAlert = false;
    let alertType = '';
    let alertContent = [];

    // コードブロック処理用の変数
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeContent = [];
    let codeBlockFence = ''; // フェンスの種類を記録（```または````）

    const closeList = () => {
      if (inUList) {
        html += '</ul>\n';
        inUList = false;
      }
      if (inOList) {
        html += '</ol>\n';
        inOList = false;
      }
    };

    const closeAlert = () => {
      if (inAlert) {
        html += `<div class="alert alert-${alertType}">`;
        html += `<div class="alert-header">`;
        html += `<span class="alert-icon">${getAlertIcon(alertType)}</span>`;
        html += `<span class="alert-title">${getAlertTitle(alertType)}</span>`;
        html += `</div>`;
        html += `<div class="alert-content">`;

        // 空行を段落区切りとして処理し、リストアイテムは独立した行として処理
        let paragraphs = [];
        let currentParagraph = [];

        alertContent.forEach((content) => {
          if (content === '') {
            // 空行の場合、現在の段落を保存
            if (currentParagraph.length > 0) {
              paragraphs.push(currentParagraph.join(' '));
              currentParagraph = [];
            }
          } else if (content.match(/^\d+\.\s/) || content.match(/^[\*\-]\s/)) {
            // リストアイテムの場合、現在の段落を保存してから新しい段落として追加
            if (currentParagraph.length > 0) {
              paragraphs.push(currentParagraph.join(' '));
              currentParagraph = [];
            }
            paragraphs.push(content);
          } else {
            // 通常の内容の場合、現在の段落に追加
            currentParagraph.push(content);
          }
        });

        // 最後の段落を追加
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(' '));
        }

        // 段落をHTMLとして出力
        paragraphs.forEach(paragraph => {
          if (paragraph.trim()) {
            html += `<p>${escapeInline(paragraph, currentSectionFootnotes, footnotes)}</p>`;
          }
        });

        html += `</div></div>\n`;

        inAlert = false;
        alertType = '';
        alertContent = [];
      }
    };

    const closeCodeBlock = () => {
      if (inCodeBlock) {
        const languageClass = codeLanguage ? ` class="language-${codeLanguage}"` : '';
        html += `<pre><code${languageClass}>`;
        codeContent.forEach((line, index) => {
          if (index > 0) html += '\n';
          html += escapeHTML(line);
        });
        html += `</code></pre>\n`;

        inCodeBlock = false;
        codeLanguage = '';
        codeContent = [];
        codeBlockFence = '';
      }
    };

    const escapeHTML = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    // 脚注定義を収集する前処理
    lines.forEach((line) => {
      const footnoteDefMatch = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
      if (footnoteDefMatch) {
        footnotes[footnoteDefMatch[1]] = footnoteDefMatch[2];
      }
    });

    // 脚注HTMLを生成する関数
    const addFootnotesToSection = () => {
      if (currentSectionFootnotes.length > 0) {
        html += '<div class="footnotes">\n';
        currentSectionFootnotes.forEach((footnoteId) => {
          if (footnotes[footnoteId]) {
            html += `<div class="footnote" id="footnote-${footnoteId}">`;
            html += `<sup>${footnoteId}</sup> ${escapeInline(footnotes[footnoteId], [], footnotes)}`;
            html += `</div>\n`;
          }
        });
        html += '</div>\n';
        currentSectionFootnotes = [];
      }
    };

    lines.forEach((raw) => {
      const line = raw.trimEnd();

      // 空行
      if (line.trim() === '') {
        if (inCodeBlock) {
          codeContent.push('');
        } else if (inAlert) {
          // アラート内の空行は改行として追加
          alertContent.push('');
        } else {
          closeList();
        }
        return;
      }

      // 脚注定義行はスキップ
      if (line.match(/^\[\^([^\]]+)\]:\s*(.+)$/)) {
        return;
      }

      // フェンスコードブロックの開始/終了（```または````に対応）
      const fenceMatch = line.match(/^(```+|````+)/);
      if (fenceMatch) {
        const currentFence = fenceMatch[1];
        if (inCodeBlock) {
          // 同じフェンスタイプの場合のみ終了
          if (currentFence === codeBlockFence) {
            closeCodeBlock();
          } else {
            // 異なるフェンスの場合は内容として追加
            codeContent.push(line);
          }
        } else {
          // コードブロック開始
          closeList();
          closeAlert();
          inCodeBlock = true;
          codeBlockFence = currentFence;
          const languageMatch = line.match(/^```+(\w+)?/);
          codeLanguage = languageMatch && languageMatch[1] ? languageMatch[1] : '';
        }
        return;
      }

      // コードブロック内の処理
      if (inCodeBlock) {
        codeContent.push(line);
        return;
      }

      // インデントコードブロック（4スペースまたはタブ）
      if (line.match(/^(    |\t)/) && !inAlert) {
        closeList();
        const codeText = line.replace(/^(    |\t)/, '');
        html += `<pre><code>${escapeHTML(codeText)}</code></pre>\n`;
        return;
      }

      // 見出し
      let m;
      if ((m = line.match(/^#####\s+(.*)/))) {
        closeList();
        closeAlert();
        closeCodeBlock();
        // レベル5以下の見出しが来たらh3,h4セクションの脚注を追加
        if (currentSectionLevel >= 3) {
          addFootnotesToSection();
        }
        currentSectionLevel = 5;
        html += `<h5>${escapeInline(m[1], currentSectionFootnotes, footnotes)}</h5>\n`;
      } else if ((m = line.match(/^####\s+(.*)/))) {
        closeList();
        closeAlert();
        closeCodeBlock();
        // レベル4以下の見出しが来たらh3セクションの脚注を追加
        if (currentSectionLevel >= 3) {
          addFootnotesToSection();
        }
        currentSectionLevel = 4;
        html += `<h4>${escapeInline(m[1], currentSectionFootnotes, footnotes)}</h4>\n`;
      } else if ((m = line.match(/^###\s+(.*)/))) {
        closeList();
        closeAlert();
        closeCodeBlock();
        // 新しいh3が来たら前のセクションの脚注を追加
        if (currentSectionLevel >= 3) {
          addFootnotesToSection();
        }
        sectionNum++;
        currentSectionLevel = 3;
        html += `<h3>${chapterNum}.${sectionNum} ${escapeInline(m[1], currentSectionFootnotes, footnotes)}</h3>\n`;
      } else if ((m = line.match(/^##\s+(.*)/))) {
        closeList();
        closeAlert();
        closeCodeBlock();
        // 新しいh2が来たら前のセクションの脚注を追加
        addFootnotesToSection();
        chapterNum++;
        sectionNum = 0; // 新しい章が始まったらセクション番号をリセット
        currentSectionLevel = 2;
        html += `<h2>${chapterNum} ${escapeInline(m[1], currentSectionFootnotes, footnotes)}</h2>\n`;
      } else if ((m = line.match(/^#\s+(.*)/))) {
        closeList();
        closeAlert();
        closeCodeBlock();
        // h1が来たら前のセクションの脚注を追加
        addFootnotesToSection();
        currentSectionLevel = 1;
        html += `<h1>${escapeInline(m[1], currentSectionFootnotes, footnotes)}</h1>\n`;
      }
      // 箇条書き
      else if (line.startsWith('* ')) {
        // 番号なしリスト (ul)
        if (inOList) {
          html += '</ol>\n';
          inOList = false;
        }
        if (!inUList) {
          html += '<ul>\n';
          inUList = true;
        }
        html += `<li>${escapeInline(line.slice(2).trim(), currentSectionFootnotes, footnotes)}</li>\n`;
      }
      else if (line.startsWith('- ')) {
        // 番号ありリスト (ol)
        if (inUList) {
          html += '</ul>\n';
          inUList = false;
        }
        if (!inOList) {
          html += '<ol>\n';
          inOList = true;
        }
        html += `<li>${escapeInline(line.slice(2).trim(), currentSectionFootnotes, footnotes)}</li>\n`;
      }
      // GitHubアラート記法とblockquoteの処理
      else if (line.startsWith('> ') || (line === '>' && inAlert)) {
        const quoteLine = line.startsWith('> ') ? line.slice(2).trim() : '';

        // GitHubアラート記法をチェック
        const alertMatch = quoteLine.match(/^\[!(NOTE|WARNING|IMPORTANT|TIP|CAUTION)\]$/);
        if (alertMatch) {
          closeList();
          closeAlert(); // 前のアラートを閉じる
          inAlert = true;
          alertType = alertMatch[1].toLowerCase();
        } else if (inAlert) {
          // アラート内容の追加（空行も含む）
          alertContent.push(quoteLine);
        } else {
          // 通常のblockquote
          closeList();
          html += `<blockquote><p>${escapeInline(quoteLine, currentSectionFootnotes, footnotes)}</p></blockquote>\n`;
        }
      }
      // 画像記法の処理（独立した行として）
      else if (line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)) {
        closeList();
        closeAlert();
        const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        const alt = match[1];
        const src = match[2];

        if (alt && alt.trim()) {
          // キャプション付き画像
          globalFigureNum++;
          html += `<figure class="image-figure">
            <img src="${src}" alt="${escapeHTML(alt)}" />
            <figcaption>図${globalFigureNum} ${escapeHTML(alt)}</figcaption>
          </figure>\n`;
        } else {
          // キャプションなし画像
          html += `<img src="${src}" alt="" />\n`;
        }
      }
      // アラート以外の行が来たらアラートを閉じる
      else if (inAlert) {
        closeAlert();
        // 現在の行も処理
        if (line.trim()) {
          html += `<p>${escapeInline(line, currentSectionFootnotes, footnotes)}</p>\n`;
        }
      }
      // 段落
      else {
        closeList();
        html += `<p>${escapeInline(line, currentSectionFootnotes, footnotes)}</p>\n`;
      }
    });

    closeList();
    closeAlert();
    closeCodeBlock();
    // 最後のセクションの脚注を追加
    addFootnotesToSection();
    return html;
  }

  // --- GitHubアラートのヘルパー関数 ----------------------------
  function getAlertIcon(type) {
    const icons = {
      'note': '💡',
      'warning': '⚠️',
      'important': '❗',
      'tip': '💡',
      'caution': '🚨'
    };
    return icons[type] || '📝';
  }

  function getAlertTitle(type) {
    const titles = {
      'note': 'Note',
      'warning': 'Warning',
      'important': 'Important',
      'tip': 'Tip',
      'caution': 'Caution'
    };
    return titles[type] || 'Alert';
  }  // --- インライン記法の簡易置換 (bold/italic/URL/footnote/link) ----------------------
  function escapeInline(text, currentFootnotes = [], footnoteDefinitions = {}) {
    // 安全のため > & < をエスケープ
    const esc = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // **bold**
    const bold = esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // *italic*
    const italic = bold.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // インラインコード `code` → <code>code</code>
    const inlineCode = italic.replace(/`([^`]+)`/g, '<code>$1</code>');

    // テキストリンクの処理 [テキスト](url) → <a href="url">テキスト</a>（脚注よりも先に処理）
    const linkProcessed = inlineCode.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 画像の処理 ![alt](src) → <img src="src" alt="alt"> またはキャプション付き画像
    const imageProcessed = linkProcessed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      if (alt && alt.trim()) {
        // キャプション付き画像
        globalFigureNum++;
        return `<figure class="image-figure">
          <img src="${src}" alt="${escapeHTML(alt)}" />
          <figcaption>図${globalFigureNum} ${escapeHTML(alt)}</figcaption>
        </figure>`;
      } else {
        // キャプションなし画像
        return `<img src="${src}" alt="" />`;
      }
    });

    // 脚注の処理 [^1] → <sup><a href="#footnote-1">1</a></sup>
    const footnoteProcessed = imageProcessed.replace(/\[\^([^\]]+)\]/g, (match, footnoteId) => {
      // 現在のセクションの脚注リストに追加
      if (currentFootnotes && !currentFootnotes.includes(footnoteId)) {
        currentFootnotes.push(footnoteId);
      }
      return `<sup><a href="#footnote-${footnoteId}" class="footnote-ref">${footnoteId}</a></sup>`;
    });

    // URLの自動リンク化（http, https, ftp対応）
    // 既にHTMLタグ内にあるURLは処理しないように改良
    const urlPattern = /(https?:\/\/[^\s<>"']+|ftp:\/\/[^\s<>"']+)/g;
    return footnoteProcessed.replace(urlPattern, (match, url) => {
      // マッチした部分の前後をチェックして、既にaタグ内にあるかどうかを判定
      const beforeMatch = footnoteProcessed.substring(0, footnoteProcessed.indexOf(match));
      const afterMatch = footnoteProcessed.substring(footnoteProcessed.indexOf(match) + match.length);

      // href="の直後にあるURLは処理しない
      if (beforeMatch.endsWith('href="') || beforeMatch.endsWith("href='")) {
        return match;
      }

      // 既にaタグで囲まれている場合は処理しない
      const lastOpenTag = beforeMatch.lastIndexOf('<a ');
      const lastCloseTag = beforeMatch.lastIndexOf('</a>');
      if (lastOpenTag > lastCloseTag && lastOpenTag !== -1) {
        return match;
      }

      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  }

  // --- Markdown ファイルをフェッチして変換 ------------------------

  // --- Summary layout adjustment (stub) ---
  function adjustSummaryLayout() {
    // No-op: cover and summary layout disabled
  }

  // --- 目次生成 ---------------------------------
  function generateTableOfContents() {
    const tocList = document.getElementById('table-of-contents');
    const headings = document.querySelectorAll('h2');

    // 既存の目次をクリア
    tocList.innerHTML = '';

    headings.forEach((heading, index) => {
      // 見出しにIDを追加（なければ）
      if (!heading.id) {
        heading.id = `heading-${index}`;
      }

      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${heading.id}`;
      a.textContent = heading.textContent;

      // クリックイベントを追加
      a.addEventListener('click', (e) => {
        e.preventDefault();
        closeMenu();

        // スムーズスクロール
        heading.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

        // アクティブ状態を更新
        updateActiveMenuItem(a);
      });

      li.appendChild(a);
      tocList.appendChild(li);
    });
  }


  // --- スクロール位置に基づくアクティブアイテムの自動更新 ---------------------------------
  function initScrollSpy() {
    const headings = document.querySelectorAll('h2');
    const tocLinks = document.querySelectorAll('.table-of-contents a');

    function updateActiveOnScroll() {
      let current = '';
      const scrollPosition = window.scrollY + 100; // オフセット

      headings.forEach(heading => {
        const sectionTop = heading.offsetTop;
        if (scrollPosition >= sectionTop) {
          current = heading.id;
        }
      });

      tocLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
          link.classList.add('active');
        }
      });
    }

    window.addEventListener('scroll', updateActiveOnScroll);
    updateActiveOnScroll(); // 初期状態の設定
  }

  // --- ハンバーガーメニューの初期化 ---------------------------------
  function initHamburgerMenu() {
    const hamburger = document.querySelector('.hamburger-btn');
    const sideMenu = document.querySelector('.side-menu');
    const overlay = document.querySelector('.overlay');

    // ハンバーガーメニューのクリックイベント
    if (hamburger) {
      hamburger.addEventListener('click', (e) => {
        e.preventDefault();
        sideMenu.classList.toggle('open');
        overlay.classList.toggle('show');
        hamburger.classList.toggle('active');
      });
    } else {
      console.error('ハンバーガーボタンが見つかりません');
    }

    // オーバーレイのクリックイベント
    if (overlay) {
      overlay.addEventListener('click', () => {
        closeMenu();
      });
    }

    // ESCキーでメニューを閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    });
  }

  // メニューを閉じる関数
  function closeMenu() {
    const sideMenu = document.querySelector('.side-menu');
    const overlay = document.querySelector('.overlay');
    const hamburger = document.querySelector('.hamburger-btn');
    if (sideMenu) sideMenu.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    if (hamburger) hamburger.classList.remove('active');
  }

  // アクティブメニューアイテムを更新する関数
  function updateActiveMenuItem(activeLink) {
    const tocLinks = document.querySelectorAll('.table-of-contents a');
    tocLinks.forEach(link => link.classList.remove('active'));
    activeLink.classList.add('active');
  }

  // ページ読み込み完了後に実行
  document.addEventListener('DOMContentLoaded', () => {
    // URLパラメータからファイル名を取得
    const urlParams = new URLSearchParams(window.location.search);
    const file = urlParams.get('file') || 'index.md';

    renderMarkdownFile(file, 'content');

    // ウィンドウリサイズ時にレイアウトを再調整
    window.addEventListener('resize', adjustSummaryLayout);

    // ハンバーガーメニューの初期化
    initHamburgerMenu();
  });

  // Markdownファイルの読み込み完了後に目次を生成する関数を更新
  function renderMarkdownFile(path, targetId) {
    fetch(path)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Markdown ファイルの取得に失敗しました');
        }
        return res.text();
      })
      .then((md) => {
        // 新しいドキュメントの読み込み時に図番号をリセット
        globalFigureNum = 0;

        const html = mdToHTML(md);
        document.getElementById(targetId).innerHTML = html;

        // 概要レイアウトを調整
        adjustSummaryLayout();

        // 目次を生成
        generateTableOfContents();

        // スクロールスパイを初期化
        initScrollSpy();
      })
      .catch((err) => {
        console.error(err);
        // ファイルが見つからない場合の詳細なエラーメッセージ
        let errorMessage = '';
        if (path === 'index.md') {
          errorMessage = `
> [!CAUTION]
> The index.md file was not found.
> 
> **Solutions:**
> 1. Create an index.md file
> 2. Or specify a file using URL parameters: \`?file=your-file.md\`
> 
> **Example:** \`index.html?file=sample.md\`
          `;
        } else {
          errorMessage = `
> [!CAUTION]
> The specified file "${path}" was not found.
> 
> **Solutions:**
> 1. Check the file name
> 2. Verify that the file exists
> 3. Or change the URL parameter: \`?file=existing-file.md\`
          `;
        }

        const html = mdToHTML(errorMessage.trim());
        document.getElementById(targetId).innerHTML = html;
      });
  }
})();

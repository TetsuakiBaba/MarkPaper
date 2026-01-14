// markpaper.js
// MarkPaper - Markdown to Clean Paper
// 自作の極小 Markdown パーサ & ローダー
(function (global) {
  const LIB_VERSION = '1.0.0';

  // グローバルな図番号管理
  let globalFigureNum = 0;

  // 図番号のリセット
  function resetFigureNum() {
    globalFigureNum = 0;
  }

  // 現在読み込まれているファイル名を保存
  let currentFileName = '';

  // フッター生成関数
  function generateFooter() {
    const fileName = currentFileName || 'unknown file';
    return `
<footer class="markpaper-footer">
  <p>This HTML page was automatically generated from "${fileName}" by <a href="https://github.com/TetsuakiBaba/MarkPaper" target="_blank" rel="noopener noreferrer">MarkPaper v${LIB_VERSION}</a>.</p>
</footer>
`;
  }

  // --- 極小 Markdown → HTML 変換関数 ----------------------------
  function mdToHTML(md) {
    // 変換開始時に図番号をリセット
    resetFigureNum();

    const lines = md.split(/\r?\n/);
    let html = '';
    let inUList = false;   // * の番号なしリスト
    let inOList = false;   // - の番号ありリスト

    // リストの入れ子管理用の変数
    let listStack = [];    // スタック形式でリストレベルを管理 [{type: 'ul', level: 0}, {type: 'ol', level: 2}, ...]
    let orderNumbers = []; // ordered listの番号管理用 [1, 1, 2, ...] (レベルごとの番号)

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

    // blockquote処理用の変数
    let inBlockquote = false;
    let blockquoteContent = [];

    // テーブル処理用の変数
    let inTable = false;
    let tableRows = [];
    let tableHeaders = [];

    // コードブロック処理用の変数
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeContent = [];
    let codeBlockFence = ''; // フェンスの種類を記録（```または````）

    const closeList = () => {
      // スタックを空になるまで閉じる
      while (listStack.length > 0) {
        const listItem = listStack.pop();
        html += `</${listItem.type}>\n`;
      }
      inUList = false;
      inOList = false;
      orderNumbers = []; // 番号もリセット
    };

    // リストレベルの管理とHTMLの生成
    const handleList = (line, listType) => {
      // インデントレベルを計算
      let match, indent, content, level;

      if (listType === 'ul') {
        // 箇条書きリスト（* のみ）
        match = line.match(/^(\s*)\*\s+(.*)$/);
        if (match) {
          content = match[2];
        }
      } else {
        // 番号付きリスト（1. または - ）
        match = line.match(/^(\s*)(-|\d+\.)\s+(.*)$/);
        if (match) {
          content = match[3]; // 番号付きリストの場合、コンテンツは3番目のグループ
        }
      }

      if (!match) return false;

      indent = match[1];
      level = Math.floor(indent.length / 2);

      // 現在のリストスタックと新しいレベルを比較
      while (listStack.length > level + 1) {
        // 深いレベルのリストを閉じる
        const closingItem = listStack.pop();
        html += `</${closingItem.type}>\n`;
        // 番号配列も調整
        if (orderNumbers.length > level + 1) {
          orderNumbers = orderNumbers.slice(0, level + 1);
        }
      }

      // 新しいリストレベルを開始する必要がある場合
      if (listStack.length === level) {
        html += `<${listType}>\n`;
        listStack.push({ type: listType, level: level });
        if (listType === 'ul') {
          inUList = true;
        } else {
          inOList = true;
          // ordered listの場合、新しいレベルの番号を初期化
          while (orderNumbers.length <= level) {
            orderNumbers.push(0);
          }
          orderNumbers[level] = 1;
        }
      }
      // 既存のリストのタイプが異なる場合、切り替える
      else if (listStack.length === level + 1 && listStack[level].type !== listType) {
        const oldItem = listStack.pop();
        html += `</${oldItem.type}>\n`;
        html += `<${listType}>\n`;
        listStack.push({ type: listType, level: level });
        if (listType === 'ul') {
          inUList = true;
          inOList = false;
        } else {
          inOList = true;
          inUList = false;
          // ordered listの場合、番号を初期化
          while (orderNumbers.length <= level) {
            orderNumbers.push(0);
          }
          orderNumbers[level] = 1;
        }
      } else if (listType === 'ol' && listStack.length === level + 1) {
        // 同じレベルのordered listの場合、番号を増やす
        orderNumbers[level] = (orderNumbers[level] || 0) + 1;
      }

      // チェックボックスの処理
      const checkboxMatch = content.match(/^\[([xX ]?)\]\s+(.*)$/);
      let liClass = '';
      let liContent;

      if (checkboxMatch) {
        const checked = checkboxMatch[1].toLowerCase() === 'x' ? ' checked' : '';
        const text = checkboxMatch[2];
        liClass = ' class="task-list-item"';
        liContent = `<input type="checkbox" disabled${checked}> ${escapeInline(text, currentSectionFootnotes, footnotes)}`;
      } else {
        liContent = escapeInline(content, currentSectionFootnotes, footnotes);
      }

      html += `<li${liClass}>${liContent}</li>\n`;

      return true;
    }; const closeAlert = () => {
      if (inAlert) {
        html += `<div class="alert alert-${alertType}">`;
        html += `<div class="alert-header">`;
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

    const closeBlockquote = () => {
      if (inBlockquote) {
        html += '<blockquote>';

        // 各行を独立した段落として処理（空行で段落を分ける）
        let paragraphs = [];
        let currentParagraph = [];

        blockquoteContent.forEach((content) => {
          if (content === '') {
            // 空行の場合、現在の段落を保存
            if (currentParagraph.length > 0) {
              paragraphs.push(currentParagraph);
              currentParagraph = [];
            }
          } else {
            // 通常の内容の場合、現在の段落に追加
            currentParagraph.push(content);
          }
        });

        // 最後の段落を追加
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph);
        }

        // 段落をHTMLとして出力（各行を個別にescapeInlineしてからbrで結合）
        paragraphs.forEach(paragraphLines => {
          if (paragraphLines.length > 0) {
            const escapedLines = paragraphLines.map(line =>
              escapeInline(line.trim(), currentSectionFootnotes, footnotes)
            );
            html += `<p>${escapedLines.join('<br>')}</p>`;
          }
        });

        html += '</blockquote>\n';

        inBlockquote = false;
        blockquoteContent = [];
      }
    };

    const closeTable = () => {
      if (inTable) {
        html += '<table>\n';

        // ヘッダー行を出力
        if (tableHeaders.length > 0) {
          html += '<thead>\n<tr>\n';
          tableHeaders.forEach(header => {
            html += `<th>${escapeInline(header.trim(), currentSectionFootnotes, footnotes)}</th>\n`;
          });
          html += '</tr>\n</thead>\n';
        }

        // データ行を出力
        if (tableRows.length > 0) {
          html += '<tbody>\n';
          tableRows.forEach(row => {
            html += '<tr>\n';
            row.forEach(cell => {
              html += `<td>${escapeInline(cell.trim(), currentSectionFootnotes, footnotes)}</td>\n`;
            });
            html += '</tr>\n';
          });
          html += '</tbody>\n';
        }

        html += '</table>\n';

        inTable = false;
        tableRows = [];
        tableHeaders = [];
      }
    };

    const closeCodeBlock = () => {
      if (inCodeBlock) {
        const languageClass = codeLanguage ? ` class="language-${codeLanguage}"` : '';
        html += `<div class="code-block-container"><button class="copy-btn">Copy</button><pre><code${languageClass}>`;
        codeContent.forEach((line, index) => {
          if (index > 0) html += '\n';
          html += _escapeHTML(line);
        });
        html += `</code></pre></div>\n`;

        inCodeBlock = false;
        codeLanguage = '';
        codeContent = [];
        codeBlockFence = '';
      }
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

    lines.forEach((raw, i) => {
      const line = raw.trimEnd();

      // 空行（メタデータ処理でマークされた行もスキップ）
      if (line.trim() === '' || line === '') {
        if (inCodeBlock) {
          codeContent.push('');
        } else if (inAlert) {
          // アラート内の空行は改行として追加
          alertContent.push('');
        } else if (inBlockquote) {
          // blockquote内の空行は改行として追加
          blockquoteContent.push('');
        } else {
          closeList();
          closeBlockquote(); // 空行でblockquoteも閉じる
          closeTable(); // 空行でテーブルも閉じる
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
          closeBlockquote();
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

      // インデントコードブロック（4スペースまたはタブ）ただしリスト項目は除外
      if (line.match(/^(    |\t)/) && !inAlert && !line.match(/^\s*\*\s+/) && !line.match(/^\s*-\s+/) && !line.match(/^\s*\d+\.\s+/)) {
        closeList();
        const codeText = line.replace(/^(    |\t)/, '');
        html += `<div class="code-block-container"><button class="copy-btn">Copy</button><pre><code>${_escapeHTML(codeText)}</code></pre></div>\n`;
        return;
      }

      // 見出し
      let m;
      if ((m = line.match(/^#####\s+(.*)/))) {
        closeList();
        closeAlert();
        closeBlockquote();
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
        closeBlockquote();
        closeCodeBlock();
        // レベル4以下の見出しが来たらh3セクションの脚注を追加
        if (currentSectionLevel >= 3) {
          addFootnotesToSection();
        }
        currentSectionLevel = 4;
        html += `<h4>${escapeInline(m[1], currentSectionFootnotes, footnotes)}</h4>\n`;
      } else if ((m = line.match(/^###\s*(.*)/))) {
        closeList();
        closeAlert();
        closeBlockquote();
        closeCodeBlock();
        // 新しいh3が来たら前のセクションの脚注を追加
        if (currentSectionLevel >= 3) {
          addFootnotesToSection();
        }
        sectionNum++;
        currentSectionLevel = 3;
        const headingText = m[1].trim() || ''; // 空の場合は空文字
        if (headingText) {
          html += `<h3>${chapterNum}.${sectionNum} ${escapeInline(headingText, currentSectionFootnotes, footnotes)}</h3>\n`;
        } else {
          html += `<h3>${chapterNum}.${sectionNum}</h3>\n`;
        }
      } else if ((m = line.match(/^##\s*(.*)/))) {
        closeList();
        closeAlert();
        closeBlockquote();
        closeCodeBlock();
        // 新しいh2が来たら前のセクションの脚注を追加
        addFootnotesToSection();
        chapterNum++;
        sectionNum = 0; // 新しい章が始まったらセクション番号をリセット
        currentSectionLevel = 2;
        const headingText = m[1].trim() || ''; // 空の場合は空文字
        if (headingText) {
          html += `<h2>${chapterNum} ${escapeInline(headingText, currentSectionFootnotes, footnotes)}</h2>\n`;
        } else {
          html += `<h2>${chapterNum}</h2>\n`;
        }
      } else if ((m = line.match(/^#\s+(.*)/))) {
        closeList();
        closeAlert();
        closeBlockquote();
        closeCodeBlock();
        closeTable();
        // h1が来たら前のセクションの脚注を追加
        addFootnotesToSection();
        currentSectionLevel = 1;

        const title = m[1];
        let metadata = {};
        let metadataEndIndex = i;

        // 次の行からメタデータを収集
        while (metadataEndIndex + 1 < lines.length) {
          const nextLine = lines[metadataEndIndex + 1].trim();
          const metaMatch = nextLine.match(/^(\w+):\s*(.+)$/);

          if (metaMatch && nextLine !== '') {
            metadata[metaMatch[1]] = metaMatch[2];
            metadataEndIndex++;
          } else if (nextLine === '') {
            // 空行の場合はスキップして続行
            metadataEndIndex++;
          } else {
            break; // メタデータ終了
          }
        }

        // メタデータが見つかった場合はインデックスを進める
        if (Object.keys(metadata).length > 0) {
          // forEachのインデックスは直接変更できないため、別の方法でスキップ処理
          for (let skipIndex = i + 1; skipIndex <= metadataEndIndex; skipIndex++) {
            if (skipIndex < lines.length) {
              lines[skipIndex] = ''; // 処理済みとしてマーク
            }
          }
        }

        // HTMLの生成
        if (Object.keys(metadata).length > 0) {
          html += `<header class="document-header">\n`;
          html += `<h1>${escapeInline(title, currentSectionFootnotes, footnotes)}</h1>\n`;

          if (metadata.author) {
            html += `<div class="author">${_escapeHTML(metadata.author)}</div>\n`;
          }
          if (metadata.date) {
            html += `<div class="date">${_escapeHTML(metadata.date)}</div>\n`;
          }
          if (metadata.institution) {
            html += `<div class="institution">${_escapeHTML(metadata.institution)}</div>\n`;
          }
          if (metadata.editor) {
            html += `<div class="editor">Edited by ${_escapeHTML(metadata.editor)}</div>\n`;
          }

          html += `</header>\n`;
        } else {
          html += `<h1>${escapeInline(title, currentSectionFootnotes, footnotes)}</h1>\n`;
        }
      }
      // 箇条書きと番号付きリスト（入れ子対応）
      else if (line.match(/^\s*[*-]\s+/) || line.match(/^\s*\d+\.\s+/)) {
        closeBlockquote(); // リスト開始時にblockquoteを閉じる
        closeAlert(); // リスト開始時にアラートを閉じる

        // リストタイプを判定
        let listType;
        if (line.match(/^\s*\d+\.\s+/)) {
          listType = 'ol';
        } else if (line.match(/^\s*-\s+/)) {
          listType = 'ol'; // - で始まる行をordered listとして扱う
        } else {
          listType = 'ul'; // * で始まる行をunordered listとして扱う
        }

        handleList(line, listType);
      }
      // テーブル行のチェック（コードブロック内ではない場合のみ）
      else if (!inCodeBlock && line.includes('|')) {
        console.log('Table candidate line:', line); // デバッグ用
        // より柔軟なテーブル行のマッチング（先頭末尾の|はオプション）
        const tableMatch = line.match(/^\s*\|?(.+)\|?\s*$/);
        if (tableMatch && tableMatch[1].includes('|')) {
          console.log('Table match found:', tableMatch[1]); // デバッグ用
          const cells = tableMatch[1].split('|').map(cell => cell.trim()).filter(cell => cell !== '');

          if (!inTable) {
            closeAlert();
            closeBlockquote();
            closeCodeBlock();
            inTable = true;

            // 最初の行をヘッダーとして扱う
            if (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].includes('-')) {
              tableHeaders = cells;
            } else {
              // ヘッダーなしの場合、最初の行もデータ行として扱う
              tableRows.push(cells);
            }
          } else {
            // セパレーター行（|---|---|）をスキップ
            if (cells.every(cell => /^[-\s:]*$/.test(cell))) {
              // セパレーター行は何もしない
            } else {
              tableRows.push(cells);
            }
          }
        }
      }
      // GitHubアラート記法とblockquoteの処理
      else if (line.startsWith('> ') || (line === '>' && (inAlert || inBlockquote))) {
        const quoteLine = line.startsWith('> ') ? line.slice(2).trim() : '';

        // GitHubアラート記法をチェック
        const alertMatch = quoteLine.match(/^\[!(NOTE|WARNING|IMPORTANT|TIP|CAUTION)\]$/);
        if (alertMatch) {
          closeList();
          closeAlert(); // 前のアラートを閉じる
          closeBlockquote(); // 前のblockquoteを閉じる
          inAlert = true;
          alertType = alertMatch[1].toLowerCase();
        } else if (inAlert) {
          // アラート内容の追加（空行も含む）
          alertContent.push(quoteLine);
        } else {
          // 通常のblockquote
          closeList();
          closeAlert(); // アラートが開いていたら閉じる
          if (!inBlockquote) {
            inBlockquote = true;
          }
          blockquoteContent.push(quoteLine);
        }
      }
      // 画像記法の処理（独立した行として）
      else if (line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)) {
        closeList();
        closeAlert();
        closeBlockquote();
        const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*(?:\{([^}]+)\})?$/);
        if (!match) {
          html += `<p>${escapeInline(line, currentSectionFootnotes, footnotes)}</p>\n`;
          return;
        }

        const alt = match[1];
        const src = match[2];
        const attrs = match[3];

        let style = '';
        if (attrs) {
          const widthMatch = attrs.match(/width\s*=\s*"?([^"}]+)"?/);
          if (widthMatch && widthMatch[1]) {
            style = ` style="width: ${_escapeHTML(widthMatch[1])};"`;
          }
        }

        html += `<figure class="image-figure">`;
        html += `<img src="${src}" alt="${_escapeHTML(alt)}"${style} />`;
        if (alt && alt.trim()) {
          // キャプション付き画像
          globalFigureNum++;
          html += `<figcaption>Fig ${globalFigureNum} ${_escapeHTML(alt)}</figcaption>`;
        }
        html += `</figure>\n`;
      }
      // アラート以外の行が来たらアラートを閉じる
      else if (inAlert) {
        closeAlert();
        closeBlockquote(); // blockquoteも閉じる
        // 現在の行も処理
        if (line.trim()) {
          html += `<p>${escapeInline(line, currentSectionFootnotes, footnotes)}</p>\n`;
        }
      }
      // blockquote以外の行が来たらblockquoteを閉じる
      else if (inBlockquote) {
        closeBlockquote();
        closeTable();
        // 現在の行も処理
        if (line.trim()) {
          html += `<p>${escapeInline(line, currentSectionFootnotes, footnotes)}</p>\n`;
        }
      }
      // 段落
      else {
        closeList();
        closeBlockquote();
        closeTable();
        html += `<p>${escapeInline(line, currentSectionFootnotes, footnotes)}</p>\n`;
      }
    });

    closeList();
    closeAlert();
    closeBlockquote();
    closeTable();
    closeCodeBlock();
    // 最後のセクションの脚注を追加
    addFootnotesToSection();

    // フッターを追加
    html += generateFooter();

    return html;
  }

  function _escapeHTML(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- 安全なHTMLタグのホワイトリスト ----------------------------
  const ALLOWED_TAGS = [
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
    'span', 'div', 'p', 'br', 'hr', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'q', 'cite',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img', 'iframe',
    'sub', 'sup', 'small', 'abbr', 'time'
  ];

  const ALLOWED_ATTRIBUTES = [
    'class', 'id', 'style', 'title', 'lang', 'dir',
    'href', 'target', 'rel', // aタグ用
    'src', 'alt', 'width', 'height', // img, iframeタグ用
    'frameborder', 'allow', 'allowfullscreen', 'webkitallowfullscreen', 'mozallowfullscreen', 'loading', 'referrerpolicy', // iframe用
    'colspan', 'rowspan', // テーブル用
    'datetime', // timeタグ用
    'cite' // blockquote, qタグ用
  ];

  const DANGEROUS_ATTRIBUTES = /^(on\w+|javascript:|data-|vbscript:|livescript:|mocha:|charset|defer|language)$/i;

  // HTMLタグをサニタイズする関数
  function sanitizeHTML(text) {
    return text.replace(/<(\/?)([\w-]+)([^>]*)>/gi, (match, slash, tag, attrs) => {
      const tagLower = tag.toLowerCase();

      // 許可されていないタグはエスケープ
      if (!ALLOWED_TAGS.includes(tagLower)) {
        return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      // 終了タグの場合はそのまま返す
      if (slash === '/') {
        return `</${tag}>`;
      }

      // 属性をサニタイズ
      let safeAttrs = '';
      if (attrs.trim()) {
        // 属性を解析（簡易版）
        const attrMatches = attrs.match(/\s+([^=\s]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g);
        if (attrMatches) {
          attrMatches.forEach(attrMatch => {
            const attrParts = attrMatch.trim().match(/^([^=\s]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?$/);
            if (attrParts) {
              const attrName = attrParts[1].toLowerCase();
              const attrValue = attrParts[2] || attrParts[3] || attrParts[4] || '';

              // 安全な属性のみ許可
              if (ALLOWED_ATTRIBUTES.includes(attrName) && !DANGEROUS_ATTRIBUTES.test(attrName)) {
                // 特定の属性値もチェック
                if (attrName === 'href') {
                  // javascript:などの危険なプロトコルを除外
                  if (!attrValue.match(/^(javascript:|vbscript:|data:|about:)/i)) {
                    safeAttrs += ` ${attrName}="${attrValue.replace(/"/g, '&quot;')}"`;
                  }
                } else if (attrName === 'src') {
                  if (tagLower === 'iframe') {
                    // iframeの場合はYouTube, Loom, Vimeoのみ許可
                    if (attrValue.match(/^(https?:\/\/(www\.)?youtube\.com\/embed\/|https?:\/\/(www\.)?loom\.com\/embed\/|https?:\/\/player\.vimeo\.com\/video\/)/i)) {
                      safeAttrs += ` ${attrName}="${attrValue.replace(/"/g, '&quot;')}"`;
                    }
                  } else {
                    // imgなどの通常のsrc
                    // 相対パス、http、https、dataのみ許可
                    if (attrValue.match(/^(https?:\/\/|data:image\/|\.?\/?[\w\-\.\/]+)$/i)) {
                      safeAttrs += ` ${attrName}="${attrValue.replace(/"/g, '&quot;')}"`;
                    }
                  }
                } else {
                  safeAttrs += ` ${attrName}="${attrValue.replace(/"/g, '&quot;')}"`;
                }
              }
            }
          });
        }
      }

      return `<${tag}${safeAttrs}>`;
    });
  }

  // --- GitHubアラートのヘルパー関数 ----------------------------
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
    // 1. まずインラインコードを処理（HTMLタグが中にあってもエスケープされるように）
    let processed = text.replace(/`([^`]+)`/g, (match, code) => {
      return `<code>${_escapeHTML(code)}</code>`;
    });

    // 2. まず安全なHTMLタグをサニタイズ（危険なタグ・属性を除去）
    const sanitizedHTML = sanitizeHTML(processed);

    // 3. 残りの < > & をエスケープ（ただし、許可されたHTMLタグは保護）
    let escaped = sanitizedHTML;

    // 許可されたHTMLタグを一時的に保護
    const tagProtectionMap = new Map();
    let protectionCounter = 0;

    // 開始タグと終了タグの両方を保護
    escaped = escaped.replace(/<(\/?)([\w-]+)([^>]*)>/g, (match, slash, tag, attrs) => {
      const tagLower = tag.toLowerCase();
      if (ALLOWED_TAGS.includes(tagLower)) {
        const protectionKey = `__TAG_PROTECT_${protectionCounter++}__`;
        tagProtectionMap.set(protectionKey, match);
        return protectionKey;
      }
      return match;
    });

    // 残りの < > & をエスケープ
    escaped = escaped
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 保護されたHTMLタグを復元
    tagProtectionMap.forEach((originalTag, protectionKey) => {
      escaped = escaped.replace(protectionKey, () => originalTag);
    });

    // 4. Markdown記法の処理
    // **bold**
    const bold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // *italic*
    const italic = bold.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // ~~strikethrough~~
    const strikethrough = italic.replace(/~~(.+?)~~/g, '<s>$1</s>');

    // インラインコードは既に処理済みなのでスキップ

    // テキストリンクの処理 [テキスト](url) → <a href="url">テキスト</a>（脚注よりも先に処理）
    const linkProcessed = strikethrough.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 画像の処理 ![alt](src) → <img src="src" alt="alt"> またはキャプション付き画像
    const imageProcessed = linkProcessed.replace(/!\[([^\]]*)\]\(([^)]+)\)\s*(?:\{([^}]+)\})?/g, (match, alt, src, attrs) => {
      let style = '';
      if (attrs) {
        const widthMatch = attrs.match(/width\s*=\s*"?([^"}]+)"?/);
        if (widthMatch && widthMatch[1]) {
          style = ` style="width: ${_escapeHTML(widthMatch[1])};"`;
        }
      }

      let figureHtml = `<figure class="image-figure">`;
      figureHtml += `<img src="${src}" alt="${_escapeHTML(alt)}"${style} />`;
      if (alt && alt.trim()) {
        // キャプション付き画像
        globalFigureNum++;
        figureHtml += `<figcaption>Fig ${globalFigureNum} ${_escapeHTML(alt)}</figcaption>`;
      }
      figureHtml += `</figure>`;
      return figureHtml;
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
    return footnoteProcessed.replace(urlPattern, (match, url, offset) => {
      // マッチした部分の前後をチェックして、既にaタグ内にあるかどうかを判定
      const beforeMatch = footnoteProcessed.substring(0, offset);
      const afterMatch = footnoteProcessed.substring(offset + match.length);

      // href=" や src=" の直後にあるURLは処理しない
      if (beforeMatch.endsWith('href="') || beforeMatch.endsWith("href='") ||
        beforeMatch.endsWith('src="') || beforeMatch.endsWith("src='")) {
        return match;
      }

      // <code>タグ内のURLは処理しない
      const lastOpenCodeTag = beforeMatch.lastIndexOf('<code>');
      const lastCloseCodeTag = beforeMatch.lastIndexOf('</code>');
      if (lastOpenCodeTag > lastCloseCodeTag && lastOpenCodeTag !== -1) {
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

  // エディタモード（リアルタイムプレビュー）の初期化
  function initEditorMode(initialContent = '') {
    // 既存のコンテンツをクリア
    const existingContent = document.getElementById('content');
    if (existingContent) existingContent.style.display = 'none';

    // エディタコンテナの作成
    const container = document.createElement('div');
    container.className = 'markpaper-editor-container';

    // 左側：エディタペイン
    const editorPane = document.createElement('div');
    editorPane.className = 'markpaper-editor-pane';

    const textarea = document.createElement('textarea');
    textarea.className = 'markpaper-editor-textarea';
    textarea.placeholder = 'Markdownを入力してください...';
    textarea.value = initialContent;

    editorPane.appendChild(textarea);

    // 右側：プレビューペイン
    const previewPane = document.createElement('div');
    previewPane.className = 'markpaper-preview-pane';

    const previewContent = document.createElement('article');
    previewContent.className = 'markpaper-preview-content';
    previewPane.appendChild(previewContent);

    container.appendChild(editorPane);
    container.appendChild(previewPane);
    document.body.appendChild(container);

    // プレビュー更新関数
    const updatePreview = () => {
      const md = textarea.value;
      const html = mdToHTML(md);
      previewContent.innerHTML = html;
      // コピーボタン機能を適用
      addCopyButtonFunctionality();
    };

    // 入力イベントでリアルタイム更新
    textarea.addEventListener('input', updatePreview);

    // 初回レンダリング
    updatePreview();

    // Tabキーの入力をサポート
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        updatePreview();
      }
    });
  }

  // 動的DOM要素を作成する関数
  function createDynamicElements() {
    // ハンバーガーボタンを作成
    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.id = 'hamburger-btn';
    hamburgerBtn.className = 'hamburger-btn';
    hamburgerBtn.setAttribute('aria-label', 'メニューを開く');
    hamburgerBtn.innerHTML = `
      <span></span>
      <span></span>
      <span></span>
    `;

    // サイドメニューを作成
    const sideMenu = document.createElement('nav');
    sideMenu.id = 'side-menu';
    sideMenu.className = 'side-menu';
    sideMenu.innerHTML = `
      <div class="side-menu-header">
        <h3>Menu</h3>
      </div>
      <ul id="table-of-contents" class="table-of-contents">
      </ul>
    `;

    // オーバーレイを作成
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.className = 'overlay';

    // body要素の最初に追加
    document.body.insertBefore(hamburgerBtn, document.body.firstChild);
    document.body.insertBefore(sideMenu, document.body.firstChild.nextSibling);
    document.body.appendChild(overlay);
  }

  // ページ読み込み完了後に実行
  document.addEventListener('DOMContentLoaded', () => {
    // URLパラメータからファイル名を取得
    const urlParams = new URLSearchParams(window.location.search);
    const fileParam = urlParams.get('file');

    // ライブラリとして使用される場合を考慮し、
    // パラメータがなく、かつデフォルトの表示先(id="content")もない場合は自動実行しない
    if (!fileParam && !document.getElementById('content')) {
      return;
    }

    const file = fileParam || 'index.md';

    // 通常モード
    // 動的DOM要素を作成
    createDynamicElements();
    renderMarkdownFile(file, 'content');

    // ウィンドウリサイズ時にレイアウトを再調整
    window.addEventListener('resize', adjustSummaryLayout);

    // ハンバーガーメニューの初期化
    initHamburgerMenu();
  });

  // Markdownファイルの読み込み完了後に目次を生成する関数を更新
  function renderMarkdownFile(path, targetId) {
    console.log('Loading file:', path); // デバッグ用

    // ファイル名を保存（パスからファイル名のみを抽出）
    currentFileName = path.split('/').pop();

    fetch(path)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Markdown ファイルの取得に失敗しました: ${res.status} ${res.statusText}`);
        }
        return res.text();
      })
      .then((md) => {
        console.log('File loaded successfully, parsing markdown...'); // デバッグ用

        const html = mdToHTML(md);
        document.getElementById(targetId).innerHTML = html;

        // 概要レイアウトを調整
        adjustSummaryLayout();

        // 目次を生成
        generateTableOfContents();

        // スクロールスパイを初期化
        initScrollSpy();

        // コードブロックにコピーボタン機能を追加
        addCopyButtonFunctionality();
      })
      .catch((err) => {
        console.error('Error loading file:', err); // デバッグ用
        console.error('Attempted path:', path); // デバッグ用
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

  // --- コピーボタン機能を追加 ----------------------------------
  function addCopyButtonFunctionality() {
    const allCodeContainers = document.querySelectorAll('.code-block-container');
    console.log('Found code containers:', allCodeContainers.length); // デバッグ用
    allCodeContainers.forEach(container => {
      const button = container.querySelector('.copy-btn');
      const codeElement = container.querySelector('pre code');
      console.log('Button found:', !!button, 'Code found:', !!codeElement); // デバッグ用
      if (button && codeElement) {
        button.addEventListener('click', () => {
          console.log('Copy button clicked'); // デバッグ用
          const codeToCopy = codeElement.innerText;
          navigator.clipboard.writeText(codeToCopy).then(() => {
            button.textContent = 'Copied!';
            button.classList.add('copied');
            setTimeout(() => {
              button.textContent = 'Copy';
              button.classList.remove('copied');
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy text: ', err);
            button.textContent = 'Error';
          });
        });
      }
    });
  }

  // 公開API
  const MarkPaper = {
    version: function () {
      return LIB_VERSION;
    },
    mdToHTML: mdToHTML,
    resetFigureNum: resetFigureNum,
    renderMarkdownFile: renderMarkdownFile,
    initEditorMode: initEditorMode,
    addCopyButtonFunctionality: addCopyButtonFunctionality,
    createDynamicElements: createDynamicElements,
    generateTableOfContents: generateTableOfContents,
    initHamburgerMenu: initHamburgerMenu,
    initScrollSpy: initScrollSpy
  };

  // グローバルスコープに公開
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkPaper;
  } else {
    global.MarkPaper = MarkPaper;
    // 互換性のために mdToHTML を直接公開（ユーザーの要望）
    global.mdToHTML = mdToHTML;
  }

})(typeof window !== 'undefined' ? window : this);

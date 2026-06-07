// markpaper.js
// MarkPaper - Markdown to Clean Paper
// 自作の極小 Markdown パーサ & ローダー
(function (global) {
  const LIB_VERSION = '1.0.6';

  // グローバルな図番号管理
  let globalFigureNum = 0;

  // 図番号のリセット
  function resetFigureNum() {
    globalFigureNum = 0;
  }

  // 現在読み込まれているファイル名を保存
  let currentFileName = '';
  const defaultDocumentTitle = typeof document !== 'undefined' ? document.title : 'MarkPaper';
  const PERSISTENT_MENU_MEDIA_QUERY = '(min-width: 1200px)';

  function updateDocumentTitle(fileName = '') {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = fileName ? `${fileName} - MarkPaper` : defaultDocumentTitle;
  }

  function isPersistentMenuLayout() {
    return typeof window !== 'undefined' && window.matchMedia(PERSISTENT_MENU_MEDIA_QUERY).matches;
  }

  function syncMenuLayoutState() {
    if (typeof document === 'undefined') {
      return;
    }

    const sideMenu = document.querySelector('.side-menu');
    const overlay = document.querySelector('.overlay');
    const hamburger = document.querySelector('.hamburger-btn');

    if (overlay) overlay.classList.remove('show');
    if (hamburger) hamburger.classList.remove('active');

    if (sideMenu) {
      if (isPersistentMenuLayout()) {
        sideMenu.classList.add('open');
      } else {
        sideMenu.classList.remove('open');
      }
    }
  }

  // フッター生成関数
  function generateFooter(customFooter = '', license = '') {
    const fileName = currentFileName || 'unknown file';
    let footerContent = '';

    const defaultLicense = 'This document is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0).';
    const activeLicense = license || defaultLicense;

    if (customFooter) {
      footerContent = `<div class="custom-footer">${customFooter}</div>`;
    } else {
      footerContent = `<p>This HTML page was automatically generated from "${fileName}" by <a href="https://github.com/TetsuakiBaba/MarkPaper" target="_blank" rel="noopener noreferrer">MarkPaper v${LIB_VERSION}</a>.</p>`;
    }

    return `
<footer class="markpaper-footer">
  ${footerContent}
  <div class="license">${activeLicense}</div>
</footer>
`;
  }

  const IMAGE_MARKDOWN_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)\s*(?:\{([^}]+)\})?$/;

  function parseImageAttributes(attrs = '') {
    let width = '';

    if (attrs) {
      const widthMatch = attrs.match(/\bwidth\s*=\s*"?([^"}]+)"?/i);
      if (widthMatch && widthMatch[1]) {
        width = widthMatch[1].trim();
      }
    }

    return { width };
  }

  function parseImageMarkdown(text) {
    const match = text.match(IMAGE_MARKDOWN_PATTERN);
    if (!match) {
      return null;
    }

    return {
      alt: match[1] || '',
      src: (match[2] || '').trim(),
      attrs: match[3] || ''
    };
  }

  function renderImageFigure(image, options = {}) {
    if (!image) {
      return '';
    }

    const { alt = '', src = '', attrs = '' } = image;
    const { inRow = false } = options;
    const { width } = parseImageAttributes(attrs);

    const imageStyleRules = [];
    if (width) {
      imageStyleRules.push(`width: ${_escapeHTML(width)};`);
    } else if (inRow) {
      imageStyleRules.push('width: 100%;');
    }

    const style = imageStyleRules.length > 0
      ? ` style="${imageStyleRules.join(' ')}"`
      : '';
    const figureClass = inRow ? 'image-figure image-figure-inline' : 'image-figure';

    let figureHtml = `<figure class="${figureClass}">`;
    figureHtml += `<img src="${_escapeHTML(src)}" alt="${_escapeHTML(alt)}"${style} />`;

    if (alt && alt.trim()) {
      globalFigureNum++;
      figureHtml += `<figcaption>Fig ${globalFigureNum} ${_escapeHTML(alt)}</figcaption>`;
    }

    figureHtml += `</figure>`;
    return figureHtml;
  }

  function renderImageRow(images) {
    if (!images || images.length === 0) {
      return '';
    }

    const figures = images
      .map(image => renderImageFigure(image, { inRow: true }))
      .join('\n');

    return `<div class="image-row">\n${figures}\n</div>\n`;
  }

  function parseTimelineAttributes(attrs = '') {
    const orderMatch = attrs.match(/\border\s*=\s*"?([a-z]+)"?/i);
    const orderValue = orderMatch ? orderMatch[1].toLowerCase() : 'asc';
    const descValues = ['desc', 'descending', 'newest', 'latest', 'reverse'];

    return {
      order: descValues.includes(orderValue) ? 'desc' : 'asc'
    };
  }

  function parseTimelineDate(value = '', boundary = 'start') {
    const raw = String(value).trim();
    const compact = raw.replace(/[./\s]/g, '');

    if (!/^\d{4}(\d{2})?(\d{2})?$/.test(compact)) {
      return null;
    }

    const year = Number(compact.slice(0, 4));
    const hasMonth = compact.length >= 6;
    const hasDay = compact.length >= 8;
    const month = hasMonth ? Number(compact.slice(4, 6)) : (boundary === 'end' ? 12 : 1);
    const day = hasDay ? Number(compact.slice(6, 8)) : (boundary === 'end' ? 31 : 1);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const displayParts = [String(year)];
    if (hasMonth) displayParts.push(String(month).padStart(2, '0'));
    if (hasDay) displayParts.push(String(day).padStart(2, '0'));

    return {
      raw,
      value: year * 10000 + month * 100 + day,
      display: displayParts.join('.'),
      datetime: compact
    };
  }

  function parseTimelineImage(value = '') {
    const raw = value.trim();
    if (!raw) {
      return null;
    }

    const image = parseImageMarkdown(raw);
    if (image) {
      return image;
    }

    return {
      alt: '',
      src: raw,
      attrs: ''
    };
  }

  function parseTimelineEraValue(value = '') {
    const parts = value.split('|');
    const rangeText = (parts.shift() || '').trim();
    const label = parts.join('|').trim();
    const rangeMatch = rangeText.match(/^(.+?)\s*(?:\.\.|-|~|to)\s*(.+)$/i);

    if (!rangeMatch) {
      return {
        start: '',
        end: '',
        label: value.trim()
      };
    }

    return {
      start: rangeMatch[1].trim(),
      end: rangeMatch[2].trim(),
      label
    };
  }

  function renderTimelineBlock(blockLines, attrs = '', currentSectionFootnotes = [], footnotes = {}) {
    const options = parseTimelineAttributes(attrs);
    const items = [];
    const eras = [];
    let currentItem = null;
    let currentEra = null;

    const ensureItem = () => {
      if (!currentItem) {
        currentItem = { date: '', description: '', image: null };
        items.push(currentItem);
      }
      currentEra = null;
      return currentItem;
    };

    blockLines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        return;
      }

      let match;
      if ((match = line.match(/^item\s*:\s*(.*)$/i))) {
        currentItem = { date: match[1].trim(), description: '', image: null };
        items.push(currentItem);
        currentEra = null;
      } else if ((match = line.match(/^date\s*:\s*(.*)$/i))) {
        ensureItem().date = match[1].trim();
      } else if ((match = line.match(/^description\s*:\s*(.*)$/i))) {
        if (currentEra && !currentItem) {
          currentEra.label = match[1].trim();
        } else {
          ensureItem().description = match[1].trim();
        }
      } else if ((match = line.match(/^image\s*:\s*(.*)$/i))) {
        ensureItem().image = parseTimelineImage(match[1]);
      } else if ((match = line.match(/^era\s*:\s*(.*)$/i))) {
        const eraValue = parseTimelineEraValue(match[1]);
        currentEra = {
          start: eraValue.start,
          end: eraValue.end,
          label: eraValue.label
        };
        eras.push(currentEra);
        currentItem = null;
      } else if ((match = line.match(/^start\s*:\s*(.*)$/i))) {
        if (currentEra) currentEra.start = match[1].trim();
      } else if ((match = line.match(/^end\s*:\s*(.*)$/i))) {
        if (currentEra) currentEra.end = match[1].trim();
      } else if (currentItem) {
        currentItem.description = currentItem.description
          ? `${currentItem.description} ${line}`
          : line;
      } else if (currentEra) {
        currentEra.label = currentEra.label ? `${currentEra.label} ${line}` : line;
      }
    });

    const normalizedItems = items
      .map((item) => {
        const date = parseTimelineDate(item.date, 'start');
        return date ? { ...item, date } : null;
      })
      .filter(Boolean)
      .sort((a, b) => options.order === 'desc'
        ? b.date.value - a.date.value
        : a.date.value - b.date.value);

    const normalizedEras = eras
      .map((era) => {
        const start = parseTimelineDate(era.start, 'start');
        const end = parseTimelineDate(era.end, 'end');
        if (!start || !end) {
          return null;
        }

        const rangeStartValue = Math.min(start.value, end.value);
        const rangeEndValue = Math.max(start.value, end.value);
        const matchingRows = normalizedItems
          .map((item, index) => (
            item.date.value >= rangeStartValue && item.date.value <= rangeEndValue
              ? index + 1
              : null
          ))
          .filter(row => row !== null);

        if (matchingRows.length === 0) {
          return null;
        }

        const rowStart = Math.min(...matchingRows);
        const rowEnd = Math.max(...matchingRows) + 1;

        return { ...era, start, end, rowStart, rowEnd };
      })
      .filter(Boolean)
      .sort((a, b) => options.order === 'desc'
        ? b.start.value - a.start.value
        : a.start.value - b.start.value);

    const eraLaneEnds = [];
    normalizedEras
      .slice()
      .sort((a, b) => {
        const rowComparison = a.rowStart - b.rowStart;
        if (rowComparison !== 0) return rowComparison;
        return a.rowEnd - b.rowEnd;
      })
      .forEach((era) => {
        let lane = eraLaneEnds.findIndex(rowEnd => rowEnd <= era.rowStart);
        if (lane === -1) {
          lane = eraLaneEnds.length;
          eraLaneEnds.push(0);
        }

        era.lane = lane;
        eraLaneEnds[lane] = era.rowEnd;
      });

    const eraLaneCount = Math.max(1, eraLaneEnds.length);
    const timelineClasses = normalizedEras.length > 0
      ? `timeline timeline-order-${options.order} timeline-has-eras`
      : `timeline timeline-order-${options.order} timeline-no-eras`;
    let timelineHtml = `<div class="${timelineClasses}" style="--timeline-era-lanes: ${eraLaneCount};">\n`;

    if (normalizedItems.length > 0) {
      timelineHtml += `<div class="timeline-events-line" style="grid-row: 1 / ${normalizedItems.length + 1};" aria-hidden="true"></div>\n`;
    }

    if (normalizedEras.length > 0) {
      normalizedEras.forEach((era) => {
        const laneWidth = 100 / eraLaneCount;
        const laneOffset = laneWidth * era.lane;
        timelineHtml += `<div class="timeline-era" style="grid-row: ${era.rowStart} / ${era.rowEnd}; width: ${laneWidth}%; margin-left: ${laneOffset}%;">`;
        timelineHtml += `<div class="timeline-era-range">${_escapeHTML(era.start.display)} - ${_escapeHTML(era.end.display)}</div>`;
        if (era.label) {
          timelineHtml += `<div class="timeline-era-label">${escapeInline(era.label, currentSectionFootnotes, footnotes)}</div>`;
        }
        timelineHtml += '</div>\n';
      });
    }

    normalizedItems.forEach((item, index) => {
      timelineHtml += `<article class="timeline-item" style="grid-row: ${index + 1};">\n`;
      timelineHtml += '<div class="timeline-marker" aria-hidden="true"></div>\n';
      timelineHtml += '<div class="timeline-item-body">\n';
      timelineHtml += `<time class="timeline-date" datetime="${_escapeHTML(item.date.datetime)}">${_escapeHTML(item.date.display)}</time>\n`;
      if (item.description) {
        timelineHtml += `<p class="timeline-description">${escapeInline(item.description, currentSectionFootnotes, footnotes)}</p>\n`;
      }
      if (item.image && item.image.src) {
        timelineHtml += `<img class="timeline-image" src="${_escapeHTML(item.image.src)}" alt="${_escapeHTML(item.image.alt || item.description || '')}" loading="lazy" />\n`;
      }
      timelineHtml += '</div>\n';
      timelineHtml += '</article>\n';
    });
    timelineHtml += '</div>\n';

    return timelineHtml;
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

    // メタデータから取得するカスタムフッター
    let customFooterText = '';
    let licenseText = '';

    // 章番号管理用の変数
    let chapterNum = 0;  // ## の番号
    let sectionNum = 0;  // ### の番号

    // 脚注管理用の変数
    let footnotes = {
      items: {},
      createInlineFootnote: null,
      getLabel: null
    };  // 脚注の定義とラベル解決を保存
    let currentSectionFootnotes = [];  // 現在のセクションの脚注
    let currentSectionLevel = 0;  // 現在のセクションレベル (2=h2, 3=h3, etc.)
    let inlineFootnoteCounter = 0;
    let maxLegacyFootnoteNumber = 0;

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
    let inImageRow = false;
    let imageRowItems = [];
    let inTimeline = false;
    let timelineAttrs = '';
    let timelineLines = [];

    // 段落処理用のバッファ
    let paragraphBuffer = [];

    const flushParagraphBuffer = () => {
      if (paragraphBuffer.length > 0) {
        // バッファの内容を結合して出力
        // 各行をエスケープしてから結合
        let content = paragraphBuffer.map(line =>
          escapeInline(line, currentSectionFootnotes, footnotes)
        ).join('\n');

        // 段落タイトル (LaTeX の \paragraph{}) の処理
        // ::タイトル:: で始まる場合、特別にスタイリングされた span で囲む
        content = content.replace(/^::(.+?)::/, '<span class="paragraph-title">$1</span>');

        html += `<p>${content}</p>\n`;
        paragraphBuffer = [];
      }
    };

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
        html += '<div class="table-container">\n<table>\n';

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

        html += '</table>\n</div>\n';

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

    const closeImageRow = () => {
      if (inImageRow) {
        html += renderImageRow(imageRowItems);
        inImageRow = false;
        imageRowItems = [];
      }
    };

    const closeTimeline = () => {
      if (inTimeline) {
        html += renderTimelineBlock(timelineLines, timelineAttrs, currentSectionFootnotes, footnotes);
        inTimeline = false;
        timelineAttrs = '';
        timelineLines = [];
      }
    };

    // 脚注定義を収集する前処理
    lines.forEach((line) => {
      const footnoteDefMatch = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
      if (footnoteDefMatch) {
        const footnoteId = footnoteDefMatch[1];
        footnotes.items[footnoteId] = {
          content: footnoteDefMatch[2],
          label: footnoteId
        };

        if (/^\d+$/.test(footnoteId)) {
          maxLegacyFootnoteNumber = Math.max(maxLegacyFootnoteNumber, Number(footnoteId));
        }
      }
    });

    let nextInlineFootnoteNumber = maxLegacyFootnoteNumber + 1 || 1;

    footnotes.createInlineFootnote = (content) => {
      inlineFootnoteCounter++;
      const footnoteId = `auto-${inlineFootnoteCounter}`;

      footnotes.items[footnoteId] = {
        content,
        label: String(nextInlineFootnoteNumber++)
      };

      return footnoteId;
    };

    footnotes.getLabel = (footnoteId) => {
      const footnote = footnotes.items[footnoteId];
      return footnote ? footnote.label : footnoteId;
    };

    // 脚注HTMLを生成する関数
    const addFootnotesToSection = () => {
      if (currentSectionFootnotes.length > 0) {
        html += '<div class="footnotes">\n';
        currentSectionFootnotes.forEach((footnoteId) => {
          const footnote = footnotes.items[footnoteId];

          if (footnote) {
            html += `<div class="footnote" id="footnote-${footnoteId}">`;
            html += `<sup>${_escapeHTML(footnote.label)}</sup> ${escapeInline(footnote.content, [], footnotes)}`;
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
        } else if (inTimeline) {
          timelineLines.push('');
        } else if (inImageRow) {
          // 画像行ブロックでは空行を許容する
        } else if (inAlert) {
          // アラート内の空行は改行として追加
          alertContent.push('');
        } else if (inBlockquote) {
          // blockquote内の空行は改行として追加
          blockquoteContent.push('');
        } else {
          flushParagraphBuffer(); // 段落を確定
          closeList();
          closeBlockquote(); // 空行でblockquoteも閉じる
          closeTable(); // 空行でテーブルも閉じる
        }
        return;
      }

      if (inTimeline) {
        if (line.match(/^:::\s*$/)) {
          closeTimeline();
          return;
        }

        timelineLines.push(line);
        return;
      }

      if (inImageRow) {
        if (line.match(/^:::\s*$/)) {
          closeImageRow();
          return;
        }

        const imageItem = parseImageMarkdown(line);
        if (imageItem) {
          imageRowItems.push(imageItem);
          return;
        }

        closeImageRow();
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
          flushParagraphBuffer(); // 前の段落を閉じる
          closeList();
          closeAlert();
          closeBlockquote();
          closeTimeline();
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

      if (line.match(/^:::images\s*$/i)) {
        flushParagraphBuffer();
        closeList();
        closeAlert();
        closeBlockquote();
        closeTable();
        closeCodeBlock();
        closeImageRow();
        closeTimeline();
        inImageRow = true;
        imageRowItems = [];
        return;
      }

      const timelineMatch = line.match(/^:::timeline\b(.*)$/i);
      if (timelineMatch) {
        flushParagraphBuffer();
        closeList();
        closeAlert();
        closeBlockquote();
        closeTable();
        closeCodeBlock();
        closeImageRow();
        inTimeline = true;
        timelineAttrs = timelineMatch[1].trim();
        timelineLines = [];
        return;
      }

      // インデントコードブロック（4スペースまたはタブ）ただしリスト項目は除外
      if (line.match(/^(    |\t)/) && !inAlert && !line.match(/^\s*\*\s+/) && !line.match(/^\s*-\s+/) && !line.match(/^\s*\d+\.\s+/)) {
        flushParagraphBuffer();
        closeList();
        const codeText = line.replace(/^(    |\t)/, '');
        html += `<div class="code-block-container"><button class="copy-btn">Copy</button><pre><code>${_escapeHTML(codeText)}</code></pre></div>\n`;
        return;
      }

      // 見出し
      let m;
      if ((m = line.match(/^#####\s+(.*)/))) {
        flushParagraphBuffer();
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
        flushParagraphBuffer();
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
        flushParagraphBuffer();
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
        flushParagraphBuffer();
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
        flushParagraphBuffer();
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
            metadata[metaMatch[1].toLowerCase()] = metaMatch[2];
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
          if (metadata.email) {
            html += `<div class="email">${_escapeHTML(metadata.email)}</div>\n`;
          }
          if (metadata.editor) {
            html += `<div class="editor">Edited by ${_escapeHTML(metadata.editor)}</div>\n`;
          }
          if (metadata.footer) {
            customFooterText = escapeInline(metadata.footer, currentSectionFootnotes, footnotes);
          }
          if (metadata.lisence) {
            licenseText = escapeInline(metadata.lisence, currentSectionFootnotes, footnotes);
          }

          html += `</header>\n`;
        } else {
          html += `<h1>${escapeInline(title, currentSectionFootnotes, footnotes)}</h1>\n`;
        }
      }
      // 水平線 (Horizontal Rule: ---, ***, ___)
      else if (line.match(/^(\s*[-*_]){3,}\s*$/)) {
        flushParagraphBuffer();
        closeList();
        closeAlert();
        closeBlockquote();
        closeCodeBlock();
        closeTable();
        html += '<hr>\n';
      }
      // 箇条書きと番号付きリスト（入れ子対応）
      else if (line.match(/^\s*[*-]\s+/) || line.match(/^\s*\d+\.\s+/)) {
        flushParagraphBuffer();
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
            flushParagraphBuffer();
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
        flushParagraphBuffer();
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
        flushParagraphBuffer();
        closeList();
        closeAlert();
        closeBlockquote();
        const image = parseImageMarkdown(line);
        if (!image) {
          // マッチしなかった場合(厳密なチェックで弾かれた場合など)は段落として処理
          // ただし既にflushしているので、この行をバッファに入れて戻る
          paragraphBuffer.push(line);
          return;
        }

        html += `${renderImageFigure(image)}\n`;
      }
      // アラート以外の行が来たらアラートを閉じる
      else if (inAlert) {
        closeAlert();
        closeBlockquote(); // blockquoteも閉じる
        // 現在の行も処理
        if (line.trim()) {
          paragraphBuffer.push(line);
        }
      }
      // blockquote以外の行が来たらblockquoteを閉じる
      else if (inBlockquote) {
        closeBlockquote();
        closeTable();
        // 現在の行も処理
        if (line.trim()) {
          paragraphBuffer.push(line);
        }
      }
      // 段落
      else {
        closeList();
        closeBlockquote();
        closeTable();
        paragraphBuffer.push(line);
      }
    });

    flushParagraphBuffer();
    closeList();
    closeAlert();
    closeBlockquote();
    closeTable();
    closeCodeBlock();
    closeImageRow();
    closeTimeline();
    // 最後のセクションの脚注を追加
    addFootnotesToSection();

    // フッターを追加
    html += generateFooter(customFooterText, licenseText);

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
                    // iframeの場合はYouTube, Loom, Vimeo, Google Mapsのみ許可
                    if (attrValue.match(/^(https?:\/\/(www\.)?youtube\.com\/embed\/|https?:\/\/(www\.)?loom\.com\/embed\/|https?:\/\/player\.vimeo\.com\/video\/|https?:\/\/(www\.)?google\.com\/maps\/embed)/i)) {
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
    const inlineProtectionMap = new Map();
    let inlineProtectionCounter = 0;

    const createInlineProtection = (html) => {
      const protectionKey = `@@INLINE_PROTECT_${inlineProtectionCounter++}@@`;
      inlineProtectionMap.set(protectionKey, html);
      return protectionKey;
    };

    // 1. まずインラインコードを保護（後続の脚注やURL変換の対象外にする）
    let processed = text.replace(/`([^`]+)`/g, (match, code) => {
      return createInlineProtection(`<code>${_escapeHTML(code)}</code>`);
    });

    // 2. \footnote{...} を内部脚注として先に退避する
    processed = processed.replace(/\\footnote\{((?:[^{}]|\\[{}])*)\}/g, (match, rawContent) => {
      if (!footnoteDefinitions || typeof footnoteDefinitions.createInlineFootnote !== 'function') {
        return match;
      }

      const footnoteContent = rawContent.replace(/\\([{}])/g, '$1').trim();
      const footnoteId = footnoteDefinitions.createInlineFootnote(footnoteContent);
      const footnoteLabel = typeof footnoteDefinitions.getLabel === 'function'
        ? footnoteDefinitions.getLabel(footnoteId)
        : footnoteId;

      if (currentFootnotes && !currentFootnotes.includes(footnoteId)) {
        currentFootnotes.push(footnoteId);
      }

      return createInlineProtection(
        `<sup><a href="#footnote-${footnoteId}" class="footnote-ref">${_escapeHTML(footnoteLabel)}</a></sup>`
      );
    });

    // 3. まず安全なHTMLタグをサニタイズ（危険なタグ・属性を除去）
    const sanitizedHTML = sanitizeHTML(processed);

    // 4. 残りの < > & をエスケープ（ただし、許可されたHTMLタグは保護）
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

    // 5. Markdown記法の処理
    // **bold**
    const bold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // *italic*
    const italic = bold.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // ~~strikethrough~~
    const strikethrough = italic.replace(/~~(.+?)~~/g, '<s>$1</s>');

    // インラインコードは既に処理済みなのでスキップ

    // テキストリンクの処理 [テキスト](url) → <a href="url">テキスト</a>（画像記法は除外）
    const linkProcessed = strikethrough.replace(/(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g, (match, prefix, label, url) => {
      return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // 脚注の処理 [^1] → <sup><a href="#footnote-1">1</a></sup>
    const footnoteProcessed = linkProcessed.replace(/\[\^([^\]]+)\]/g, (match, footnoteId) => {
      // 現在のセクションの脚注リストに追加
      if (currentFootnotes && !currentFootnotes.includes(footnoteId)) {
        currentFootnotes.push(footnoteId);
      }
      const footnoteLabel = typeof footnoteDefinitions.getLabel === 'function'
        ? footnoteDefinitions.getLabel(footnoteId)
        : footnoteId;
      return `<sup><a href="#footnote-${footnoteId}" class="footnote-ref">${_escapeHTML(footnoteLabel)}</a></sup>`;
    });

    // URLの自動リンク化（http, https, ftp対応）
    // 既にHTMLタグ内にあるURLは処理しないように改良
    const urlPattern = /(https?:\/\/[^\s<>"']+|ftp:\/\/[^\s<>"']+)/g;
    const finalHtml = footnoteProcessed.replace(urlPattern, (match, url, offset) => {
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

    let restoredHtml = finalHtml;
    inlineProtectionMap.forEach((originalHtml, protectionKey) => {
      restoredHtml = restoredHtml.split(protectionKey).join(originalHtml);
    });

    // かな文字を個別に span で囲む（CSSでサイズ調整可能にするため）
    const tokens = restoredHtml.split(/(<[^>]+>)/g);
    let inCode = false;
    return tokens.map(token => {
      if (token.startsWith('<')) {
        if (token.startsWith('<code') || token.startsWith('<pre')) inCode = true;
        if (token.startsWith('</code') || token.startsWith('</pre')) inCode = false;
        return token;
      }
      if (inCode) return token;
      // ひらがな (\u3040-\u309F) と カタカナ (\u30A0-\u30FF) を個別に span で囲む
      return token.replace(/[\u3040-\u309F\u30A0-\u30FF]/g, match => {
        return `<span class="kana">${match}</span>`;
      });
    }).join('');
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
    const printButton = document.querySelector('.menu-action-btn[data-action="print"]');
    const persistentMenuMediaQuery = window.matchMedia(PERSISTENT_MENU_MEDIA_QUERY);

    // ハンバーガーメニューのクリックイベント
    if (hamburger) {
      hamburger.addEventListener('click', (e) => {
        e.preventDefault();
        if (isPersistentMenuLayout()) {
          return;
        }
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

    if (printButton) {
      printButton.addEventListener('click', () => {
        closeMenu();
        window.setTimeout(() => {
          window.print();
        }, 120);
      });
    }

    window.addEventListener('beforeprint', closeMenu);
    syncMenuLayoutState();

    if (typeof persistentMenuMediaQuery.addEventListener === 'function') {
      persistentMenuMediaQuery.addEventListener('change', syncMenuLayoutState);
    } else if (typeof persistentMenuMediaQuery.addListener === 'function') {
      persistentMenuMediaQuery.addListener(syncMenuLayoutState);
    }
  }

  // メニューを閉じる関数
  function closeMenu() {
    const sideMenu = document.querySelector('.side-menu');
    const overlay = document.querySelector('.overlay');
    const hamburger = document.querySelector('.hamburger-btn');
    if (sideMenu) {
      if (isPersistentMenuLayout()) {
        sideMenu.classList.add('open');
      } else {
        sideMenu.classList.remove('open');
      }
    }
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
     <div class="menu-actions">
        <button class="menu-action-btn" type="button" data-action="print" title="印刷ダイアログを開いてPDF保存できます">Print</button>
      </div>
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
  if (typeof document !== 'undefined') {
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
  }

  // Markdownファイルの読み込み完了後に目次を生成する関数を更新
  function renderMarkdownFile(path, targetId) {
    console.log('Loading file:', path); // デバッグ用

    // ファイル名を保存（パスからファイル名のみを抽出）
    currentFileName = path.split('/').pop();
    updateDocumentTitle(currentFileName);

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
        updateDocumentTitle();
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
    initScrollSpy: initScrollSpy,
    updateDocumentTitle: updateDocumentTitle
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

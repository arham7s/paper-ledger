const DB_NAME = "paper-ledger";
const DB_VERSION = 1;
const STORE_NAME = "papers";

const state = {
  papers: [],
  selectedId: null,
  editingId: null,
  pendingDeleteId: null,
  pendingPdf: null,
  keywordFormatTimer: null,
};

const els = {
  totalPapers: document.querySelector("#totalPapers"),
  pdfCount: document.querySelector("#pdfCount"),
  latestDate: document.querySelector("#latestDate"),
  resultCount: document.querySelector("#resultCount"),
  paperList: document.querySelector("#paperList"),
  paperItemTemplate: document.querySelector("#paperItemTemplate"),
  searchInput: document.querySelector("#searchInput"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  newPaperButton: document.querySelector("#newPaperButton"),
  newPaperInlineButton: document.querySelector("#newPaperInlineButton"),
  emptyAddButton: document.querySelector("#emptyAddButton"),
  paperDialog: document.querySelector("#paperDialog"),
  paperForm: document.querySelector("#paperForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  cancelButton: document.querySelector("#cancelButton"),
  titleInput: document.querySelector("#titleInput"),
  abstractInput: document.querySelector("#abstractInput"),
  keywordsInput: document.querySelector("#keywordsInput"),
  pdfInput: document.querySelector("#pdfInput"),
  fileLabel: document.querySelector("#fileLabel"),
  pdfHelpText: document.querySelector("#pdfHelpText"),
  emptyState: document.querySelector("#emptyState"),
  paperDetail: document.querySelector("#paperDetail"),
  selectedAddedOn: document.querySelector("#selectedAddedOn"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedAbstract: document.querySelector("#selectedAbstract"),
  selectedKeywords: document.querySelector("#selectedKeywords"),
  selectedPdfName: document.querySelector("#selectedPdfName"),
  selectedPdfSize: document.querySelector("#selectedPdfSize"),
  downloadPdfButton: document.querySelector("#downloadPdfButton"),
  editPaperButton: document.querySelector("#editPaperButton"),
  deletePaperButton: document.querySelector("#deletePaperButton"),
  deleteDialog: document.querySelector("#deleteDialog"),
  deleteForm: document.querySelector("#deleteForm"),
  deleteCopy: document.querySelector("#deleteCopy"),
  closeDeleteDialogButton: document.querySelector("#closeDeleteDialogButton"),
  cancelDeleteButton: document.querySelector("#cancelDeleteButton"),
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = operation(store);

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getAllPapers() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatBytes(bytes) {
  if (!bytes) return "No file size";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function setPdfHelp(message, tone = "neutral") {
  els.pdfHelpText.textContent = message;
  els.pdfHelpText.dataset.tone = tone;
}

function normalizeExtractedText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1$2")
    .replace(/([A-Za-z])-\s+([a-z])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanExtractedParagraph(text) {
  return normalizeExtractedText(text)
    .replace(/\n+/g, " ")
    .replace(/([A-Za-z])-\s+([a-z])/g, "$1$2")
    .replace(/(\d)\s+\.\s+(\d)/g, "$1.$2")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitleLine(line) {
  return line
    .replace(/^\d+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[|•]+$/g, "")
    .trim();
}

function titleFromFileName(fileName) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanKeywords(value) {
  return value
    .replace(/\b(index terms?|key words?|keywords?)\b\s*[:.\-—]?\s*/gi, "")
    .replace(/\b(recommender),\s+(systems?)\b/gi, "$1 $2")
    .replace(/[\n\r]+/g, ", ")
    .replace(/[;•·∙●▪‣|]+/g, ", ")
    .replace(/\s+[·•∙●▪‣]\s+/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/,+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[,\s]+|[,\s.;]+$/g, "")
    .split(",")
    .map((keyword) => keyword.trim().replace(/^[\-–—]+|[\-–—]+$/g, ""))
    .map((keyword) => keyword.replace(/\b(and|or)\s*$/i, "").trim())
    .filter((keyword) => keyword.length > 1)
    .filter((keyword) => !isKeywordNoise(keyword))
    .filter((keyword, index, keywords) => {
      return keywords.findIndex((item) => item.toLowerCase() === keyword.toLowerCase()) === index;
    })
    .slice(0, 12)
    .join(", ");
}

function isKeywordNoise(keyword) {
  return (
    keyword.length > 80 ||
    /\b(abstract|introduction|references|figure|table|copyright|permission|proceedings|acm reference format|ccs concepts)\b/i.test(keyword) ||
    /\.$/.test(keyword)
  );
}

function isSectionHeading(line) {
  return /^(?:\d+\.?\s*)?(abstract|introduction|background|related work|methodology|methods?|experiments?|results?|discussion|conclusion|references|acknowledg(?:e)?ments?|ccs concepts|acm reference format)\b/i.test(line.trim());
}

function trimInlineSectionBoundary(text) {
  return text
    .replace(/\s+(?:\d+\.?\s*)?(?:abstract|introduction|background|related work|methodology|methods?|experiments?|results?|discussion|conclusion|references|ccs concepts|acm reference format)\b[\s\S]*$/i, "")
    .trim();
}

function extractKeywordsFromLayout(pages) {
  const lines = pages
    .slice(0, 2)
    .flatMap((page) => page.lines || [])
    .map((line) => cleanTitleLine(line.text))
    .filter(Boolean);

  const startIndex = lines.findIndex((line) => /\b(?:keywords?|key words?|index terms?)\b\s*[:.\-—]?/i.test(line));
  if (startIndex === -1) return "";

  const chunks = [];
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 5); index += 1) {
    const line = lines[index];
    const afterHeading = index === startIndex
      ? line.replace(/^[\s\S]*?\b(?:keywords?|key words?|index terms?)\b\s*[:.\-—]?\s*/i, "")
      : line;
    const candidate = trimInlineSectionBoundary(afterHeading);

    if (index > startIndex && isSectionHeading(line)) break;
    if (!candidate) continue;
    if (index > startIndex && /[.!?]$/.test(candidate) && !/[;,•·∙●▪‣|]/.test(candidate)) break;

    chunks.push(candidate);
    if (chunks.join(" ").length > 280) break;
  }

  return cleanKeywords(chunks.join(" "));
}

function extractKeywords(extraction, normalized) {
  const layoutKeywords = typeof extraction === "string" ? "" : extractKeywordsFromLayout(extraction.pages || []);
  if (layoutKeywords) return layoutKeywords;

  const keywordsMatch = normalized.match(/(?:^|\n)\s*(?:keywords?|key words?|index terms?)\s*[:.\-—]?\s*([\s\S]*?)(?=\n\s*(?:abstract|introduction|1\.?\s+introduction|i\.?\s+introduction|background|related work|references|ccs concepts|acm reference format)\b|$)/i);
  if (!keywordsMatch?.[1]) return "";

  const firstParagraph = trimInlineSectionBoundary(keywordsMatch[1].split(/\n{2,}/)[0]);
  return cleanKeywords(firstParagraph);
}

function inferPaperDetails(extraction, fileName) {
  const normalized = normalizeExtractedText(typeof extraction === "string" ? extraction : extraction.text);
  const lines = normalized
    .split("\n")
    .map((line) => cleanTitleLine(line))
    .filter(Boolean);

  const abstractMatch = normalized.match(/(?:^|\n)\s*abstract\s*[:.\-]?\s*([\s\S]*?)(?=\n\s*(?:keywords?|key words?|index terms?|introduction|1\.?\s+introduction|i\.?\s+introduction|background|related work)\b|$)/i);
  const abstract = abstractMatch?.[1]
    ? cleanExtractedParagraph(abstractMatch[1]).replace(/^[:.\-\s]+/, "")
    : "";
  const keywords = extractKeywords(extraction, normalized);

  const firstPage = typeof extraction === "string" ? null : extraction.pages[0];
  const layoutTitle = firstPage ? inferTitleFromLayout(firstPage.lines || [], firstPage.height) : "";
  const titleStopIndex = lines.findIndex((line) => /^(abstract|keywords?|key words?|index terms?)\b/i.test(line));
  const titleSearchLines = (titleStopIndex > 0 ? lines.slice(0, titleStopIndex) : lines.slice(0, 12))
    .filter((line) => {
      const lower = line.toLowerCase();
      return (
        line.length >= 8 &&
        !lower.includes("@") &&
        !/^(arxiv|doi|preprint|proceedings|journal|conference|university|department|school of|keywords?)\b/.test(lower) &&
        !/^\d+$/.test(line)
      );
    });

  const title = layoutTitle || titleSearchLines.sort((a, b) => scoreTitleLine(b) - scoreTitleLine(a))[0] || titleFromFileName(fileName);

  return {
    title: title.slice(0, 180),
    abstract: abstract.slice(0, 2600),
    keywords,
  };
}

function scoreTitleLine(line) {
  let score = Math.min(line.length, 120);
  if (line.length > 140) score -= 70;
  if (/[.!?]$/.test(line)) score -= 20;
  if (/\b(abstract|introduction|keywords|figure|table)\b/i.test(line)) score -= 80;
  if (/^[A-Z0-9\s:,-]+$/.test(line) && line.length > 20) score += 8;
  return score;
}

function inferTitleFromLayout(lines, pageHeight = 792) {
  const titleZoneMinY = pageHeight * 0.48;
  const candidates = lines
    .map((line, index) => ({ ...line, index, text: cleanTitleLine(line.text) }))
    .filter((line) => {
      const lower = line.text.toLowerCase();
      return (
        line.text.length >= 12 &&
        line.text.length <= 180 &&
        line.y > titleZoneMinY &&
        !lower.includes("@") &&
        !/^(abstract|keywords?|key words?|index terms?|author|authors?|university|department|school of|doi|arxiv)\b/.test(lower)
      );
    });

  if (!candidates.length) return "";

  const maxSize = Math.max(...candidates.map((line) => line.fontSize));
  const largeLines = candidates
    .filter((line) => line.fontSize >= maxSize - 1)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const titleLines = [largeLines[0]];
  for (let index = 1; index < largeLines.length; index += 1) {
    const previous = titleLines[titleLines.length - 1];
    const current = largeLines[index];
    if (Math.abs(previous.y - current.y) <= 32 && current.index - previous.index <= 3) {
      titleLines.push(current);
    }
  }

  return titleLines
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((line) => line.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (window.pdfJsLoading) return window.pdfJsLoading;

  window.pdfJsLoading = new Promise((resolve) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => resolve(null), 3500);

    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve(window.pdfjsLib || null);
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };

    document.head.append(script);
  });

  return window.pdfJsLoading;
}

function linesFromPdfItems(items) {
  const lines = [];
  let currentLine = [];
  let lastY = null;
  let currentMeta = null;

  const visualItems = [...items].sort((a, b) => {
    const ay = Math.round(a.transform?.[5] || 0);
    const by = Math.round(b.transform?.[5] || 0);
    if (Math.abs(by - ay) > 4) return by - ay;
    return (a.transform?.[4] || 0) - (b.transform?.[4] || 0);
  });

  visualItems.forEach((item) => {
    const value = item.str?.trim();
    if (!value) return;

    const y = Math.round(item.transform?.[5] || 0);
    const x = item.transform?.[4] || 0;
    const fontSize = Math.hypot(item.transform?.[0] || 0, item.transform?.[1] || 0) || item.height || 0;
    if (lastY !== null && Math.abs(y - lastY) > 4 && currentLine.length) {
      lines.push({
        text: currentLine.join(" "),
        x: currentMeta.x,
        y: currentMeta.y,
        fontSize: currentMeta.fontSize,
      });
      currentLine = [];
      currentMeta = null;
    }

    currentLine.push(value);
    if (!currentMeta) {
      currentMeta = { x, y, fontSize };
    } else {
      currentMeta.fontSize = Math.max(currentMeta.fontSize, fontSize);
    }
    lastY = y;
  });

  if (currentLine.length) {
    lines.push({
      text: currentLine.join(" "),
      x: currentMeta.x,
      y: currentMeta.y,
      fontSize: currentMeta.fontSize,
    });
  }

  return lines;
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();

  if (pdfjsLib) {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
    const pageCount = Math.min(pdf.numPages, 4);
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const lines = linesFromPdfItems(content.items);
      pages.push({
        number: pageNumber,
        height: viewport.height,
        lines,
        text: lines.map((line) => line.text).join("\n"),
      });
    }

    return {
      pages,
      text: normalizeExtractedText(pages.map((page) => page.text).join("\n\n")),
    };
  }

  return {
    pages: [],
    text: extractRawPdfStrings(await file.text()),
  };
}

function extractRawPdfStrings(raw) {
  const chunks = [];
  const regex = /\(([^()]{2,})\)/g;
  let match = regex.exec(raw);

  while (match && chunks.length < 900) {
    const value = match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\([()\\])/g, "$1")
      .trim();
    if (/[A-Za-z]{3}/.test(value)) chunks.push(value);
    match = regex.exec(raw);
  }

  return normalizeExtractedText(chunks.join("\n"));
}

async function autofillFromPdf(file) {
  setPdfHelp("Reading the PDF and looking for title, abstract, and keywords...", "working");

  try {
    const text = await extractPdfText(file);
    if (!text || text.length < 30) {
      throw new Error("No readable text found.");
    }

    const details = inferPaperDetails(text, file.name);
    const shouldOverwrite = !state.editingId;

    if (details.title && (shouldOverwrite || !els.titleInput.value.trim())) {
      els.titleInput.value = details.title;
    }
    if (details.abstract && (shouldOverwrite || !els.abstractInput.value.trim())) {
      els.abstractInput.value = details.abstract;
    }
    if (details.keywords && (shouldOverwrite || !els.keywordsInput.value.trim())) {
      els.keywordsInput.value = cleanKeywords(details.keywords);
    }

    if (details.abstract) {
      const keywordNote = details.keywords ? " Keywords were found too." : " I could not confidently find keywords.";
      setPdfHelp(`Autofilled from the PDF.${keywordNote} Give it a quick review, then save the paper.`, "success");
    } else {
      setPdfHelp("I found a likely title, but could not confidently find the abstract or keywords. You can paste or edit them manually.", "warning");
    }
  } catch (error) {
    console.warn(error);
    if (!els.titleInput.value.trim()) {
      els.titleInput.value = titleFromFileName(file.name);
    }
    setPdfHelp("I could not read this PDF automatically. I used the filename as a title; add the abstract and keywords manually.", "warning");
  }
}

function currentSearch() {
  return els.searchInput.value.trim().toLowerCase();
}

function filteredPapers() {
  const query = currentSearch();
  const sorted = [...state.papers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!query) return sorted;
  return sorted.filter((paper) => {
    return `${paper.title} ${paper.abstract} ${paper.keywords || ""}`.toLowerCase().includes(query);
  });
}

function renderStats() {
  const latest = state.papers.reduce((newest, paper) => {
    if (!newest) return paper;
    return new Date(paper.createdAt) > new Date(newest.createdAt) ? paper : newest;
  }, null);

  els.totalPapers.textContent = state.papers.length;
  els.pdfCount.textContent = state.papers.filter((paper) => paper.pdf).length;
  els.latestDate.textContent = latest ? formatDate(latest.createdAt) : "-";
}

function renderList() {
  const papers = filteredPapers();
  els.paperList.innerHTML = "";
  els.resultCount.textContent = `${papers.length} ${papers.length === 1 ? "paper" : "papers"}`;

  if (!papers.length) {
    const empty = document.createElement("p");
    empty.className = "paper-preview";
    empty.textContent = currentSearch() ? "No matching papers yet." : "No papers stored yet.";
    els.paperList.append(empty);
    return;
  }

  papers.forEach((paper) => {
    const node = els.paperItemTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle("active", paper.id === state.selectedId);
    node.querySelector(".paper-title").textContent = paper.title;
    node.querySelector(".paper-preview").textContent = paper.keywords ? `Keywords: ${paper.keywords}` : paper.abstract;
    node.querySelector(".paper-date").textContent = `Added ${formatDate(paper.createdAt)}`;
    node.querySelector(".pdf-pill").textContent = paper.pdf ? "PDF" : "No PDF";
    node.querySelector(".pdf-pill").classList.toggle("missing", !paper.pdf);

    node.querySelector(".paper-select").addEventListener("click", () => {
      state.selectedId = paper.id;
      render();
    });

    node.querySelector(".edit-entry").addEventListener("click", () => {
      state.selectedId = paper.id;
      render();
      openForm(paper);
    });

    node.querySelector(".delete-entry").addEventListener("click", () => {
      requestDeletePaper(paper.id);
    });

    els.paperList.append(node);
  });
}

function renderDetail() {
  const selected = state.papers.find((paper) => paper.id === state.selectedId);
  els.emptyState.classList.toggle("hidden", Boolean(selected));
  els.paperDetail.classList.toggle("hidden", !selected);

  if (!selected) return;

  els.selectedAddedOn.textContent = `Added ${formatDate(selected.createdAt)}`;
  els.selectedTitle.textContent = selected.title;
  els.selectedAbstract.textContent = selected.abstract;
  renderKeywords(selected.keywords);
  els.selectedPdfName.textContent = selected.pdf?.name || "No PDF attached";
  els.selectedPdfSize.textContent = selected.pdf ? formatBytes(selected.pdf.size) : "Edit this paper to upload a PDF";
  els.downloadPdfButton.disabled = !selected.pdf;
}

function renderKeywords(keywords) {
  els.selectedKeywords.innerHTML = "";
  const keywordList = cleanKeywords(keywords || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (!keywordList.length) {
    const empty = document.createElement("span");
    empty.className = "keyword-empty";
    empty.textContent = "No keywords saved";
    els.selectedKeywords.append(empty);
    return;
  }

  keywordList.forEach((keyword) => {
    const chip = document.createElement("span");
    chip.className = "keyword-chip";
    chip.textContent = keyword;
    els.selectedKeywords.append(chip);
  });
}

function render() {
  renderStats();
  renderList();
  renderDetail();
}

async function loadPapers() {
  state.papers = await getAllPapers();
  if (!state.selectedId && state.papers.length) {
    state.selectedId = [...state.papers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].id;
  }
  render();
}

function resetForm() {
  state.editingId = null;
  state.pendingPdf = null;
  els.paperForm.reset();
  els.fileLabel.textContent = "Upload PDF to autofill details";
  setPdfHelp("The app will try to read the title, abstract, and keywords from the PDF. You can edit them before saving.");
}

function openForm(paper = null) {
  resetForm();
  if (paper) {
    state.editingId = paper.id;
    els.dialogTitle.textContent = "Edit Paper";
    els.titleInput.value = paper.title;
    els.abstractInput.value = paper.abstract;
    els.keywordsInput.value = cleanKeywords(paper.keywords || "");
    els.fileLabel.textContent = paper.pdf ? `Keep PDF: ${paper.pdf.name}` : "Upload PDF";
    setPdfHelp("Choose a new PDF to replace the file and try autofill again.");
  } else {
    els.dialogTitle.textContent = "Add Paper";
  }
  els.paperDialog.showModal();
  els.pdfInput.focus();
}

function closeForm() {
  els.paperDialog.close();
  resetForm();
}

function requestDeletePaper(id) {
  const paper = state.papers.find((entry) => entry.id === id);
  if (!paper) return;

  state.pendingDeleteId = id;
  els.deleteCopy.textContent = `"${paper.title}" will be removed from your paper log. The saved PDF for this entry will be removed too.`;
  els.deleteDialog.showModal();
}

function closeDeleteDialog() {
  els.deleteDialog.close();
  state.pendingDeleteId = null;
}

async function savePaper(event) {
  event.preventDefault();

  const existing = state.papers.find((paper) => paper.id === state.editingId);
  const now = new Date().toISOString();
  const paper = {
    id: existing?.id || crypto.randomUUID(),
    title: els.titleInput.value.trim(),
    abstract: els.abstractInput.value.trim(),
    keywords: cleanKeywords(els.keywordsInput.value.trim()),
    pdf: state.pendingPdf || existing?.pdf || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await withStore("readwrite", (store) => store.put(paper));
  state.selectedId = paper.id;
  closeForm();
  await loadPapers();
}

async function deleteSelectedPaper() {
  requestDeletePaper(state.selectedId);
}

async function confirmDeletePaper(event) {
  event.preventDefault();
  const id = state.pendingDeleteId;
  if (!id) return;

  await withStore("readwrite", (store) => store.delete(id));
  if (state.selectedId === id) {
    state.selectedId = null;
  }
  closeDeleteDialog();
  await loadPapers();
}

function openSelectedPdf() {
  const selected = state.papers.find((paper) => paper.id === state.selectedId);
  if (!selected?.pdf) return;

  const url = URL.createObjectURL(selected.pdf.blob);
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

els.newPaperButton.addEventListener("click", () => openForm());
els.newPaperInlineButton.addEventListener("click", () => openForm());
els.emptyAddButton.addEventListener("click", () => openForm());
els.closeDialogButton.addEventListener("click", closeForm);
els.cancelButton.addEventListener("click", closeForm);
els.paperForm.addEventListener("submit", savePaper);
els.searchInput.addEventListener("input", render);
els.clearSearchButton.addEventListener("click", () => {
  els.searchInput.value = "";
  render();
});

els.editPaperButton.addEventListener("click", () => {
  const selected = state.papers.find((paper) => paper.id === state.selectedId);
  if (selected) openForm(selected);
});

els.deletePaperButton.addEventListener("click", deleteSelectedPaper);
els.downloadPdfButton.addEventListener("click", openSelectedPdf);
els.deleteForm.addEventListener("submit", confirmDeletePaper);
els.closeDeleteDialogButton.addEventListener("click", closeDeleteDialog);
els.cancelDeleteButton.addEventListener("click", closeDeleteDialog);
els.keywordsInput.addEventListener("input", () => {
  window.clearTimeout(state.keywordFormatTimer);
  state.keywordFormatTimer = window.setTimeout(() => {
    const formatted = cleanKeywords(els.keywordsInput.value);
    if (formatted !== els.keywordsInput.value) {
      els.keywordsInput.value = formatted;
    }
  }, 350);
});
els.keywordsInput.addEventListener("blur", () => {
  els.keywordsInput.value = cleanKeywords(els.keywordsInput.value);
});

els.pdfInput.addEventListener("change", async () => {
  const file = els.pdfInput.files?.[0];
  if (!file) {
    state.pendingPdf = null;
    els.fileLabel.textContent = "Upload PDF to autofill details";
    setPdfHelp("The app will try to read the title, abstract, and keywords from the PDF. You can edit them before saving.");
    return;
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    window.alert("Please choose a PDF file.");
    els.pdfInput.value = "";
    setPdfHelp("Choose a PDF file so the app can read its title and abstract.", "warning");
    return;
  }

  state.pendingPdf = {
    name: file.name,
    size: file.size,
    type: file.type || "application/pdf",
    blob: file,
  };
  els.fileLabel.textContent = file.name;
  await autofillFromPdf(file);
});

loadPapers().catch((error) => {
  console.error(error);
  window.alert("Paper Ledger could not load its local database.");
});

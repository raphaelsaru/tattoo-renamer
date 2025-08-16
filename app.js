// Minimal, dependency-free static app using Transformers.js via CDN for CLIP
// UI wiring, file management, inference, and exports

// Models via Transformers.js
// We will lazy-load the library and pipeline when needed

const elements = {
	fileInput: document.getElementById('file-input'),
	dropzone: document.getElementById('dropzone'),
	threshold: document.getElementById('threshold'),
	thresholdNumber: document.getElementById('threshold-number'),
	grid: document.getElementById('grid'),
	empty: document.getElementById('empty-state'),
	downloadZip: document.getElementById('download-zip'),
	downloadCsv: document.getElementById('download-csv'),
	clearAll: document.getElementById('clear-all'),
	reclassify: document.getElementById('reclassify'),
	modelStatus: document.getElementById('model-status')
};

// Candidate labels (Portuguese) with synonyms for better CLIP matching and canonical mapping.
const THEME_OPTIONS = [
	{ key: 'leão', candidates: ['leão', 'leao', 'lion'] },
	{ key: 'lobo', candidates: ['lobo', 'wolf'] },
	{ key: 'onça', candidates: ['onça', 'onca', 'jaguar', 'leopard'] },
	{ key: 'jesus', candidates: ['jesus', 'cristo', 'jesus cristo', 'christ'] },
	{ key: 'pequena sereia', candidates: ['pequena sereia', 'ariel', 'the little mermaid'] },
	{ key: 'caveira', candidates: ['caveira', 'skull'] },
	{ key: 'rosa', candidates: ['rosa', 'rose'] },
	{ key: 'dragão', candidates: ['dragão', 'dragao', 'dragon'] },
	{ key: 'dog', candidates: ['dog', 'cachorro', 'puppy'] }
];

const STYLE_OPTIONS = [
	{ key: 'realismo', candidates: ['realismo', 'realistic', 'realism'] },
	{ key: 'realismo-pb', candidates: ['realismo pb', 'realismo preto e branco', 'preto e branco realista', 'black and white realistic', 'bw realistic'] },
	{ key: 'fineline', candidates: ['fineline', 'fine line', 'linha fina'] },
	{ key: 'geométrico', candidates: ['geométrico', 'geometrico', 'geometric'] },
	{ key: 'mandala', candidates: ['mandala'] },
	{ key: 'aquarela', candidates: ['aquarela', 'watercolor', 'watercolour'] },
	{ key: 'religiosa', candidates: ['religiosa', 'religious', 'religion'] },
	{ key: 'escrita', candidates: ['escrita', 'lettering', 'tipografia', 'hand lettering'] }
];

// Template helpers to build candidate labels array and canonical map
function buildCandidateLabels(options) {
	return options.flatMap(opt => opt.candidates);
}

function mapBackToCanonical(options, predictedLabel) {
	const normalized = predictedLabel.trim().toLowerCase();
	for (const opt of options) {
		for (const cand of opt.candidates) {
			if (normalized === cand.trim().toLowerCase()) return opt.key;
		}
	}
	return predictedLabel;
}

// Utilities
function slugify(text) {
	return text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function formatConfidence(value) {
	return `${(value * 100).toFixed(1)}%`;
}

function readFileAsDataURL(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

// State
const imageItems = []; // { id, file, dataUrl, theme, style, themeScore, styleScore, nameOverride }
let modelLoaded = false;
let pipelineVision = null; // CLIP pipeline

async function ensureModelLoaded() {
	if (modelLoaded) return;
	setModelStatus('baixando modelos…');
	// Load Transformers.js dynamically
	if (!window.transformers) {
		await loadScript('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.1');
	}
	const { pipeline } = window.transformers;
	setModelStatus('inicializando CLIP…');
	// Use a lightweight CLIP model for zero-shot image classification
	pipelineVision = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
	modelLoaded = true;
	setModelStatus('pronto');
}

function setModelStatus(text) {
	if (elements.modelStatus) elements.modelStatus.textContent = text;
}

function loadScript(src) {
	return new Promise((resolve, reject) => {
		const el = document.createElement('script');
		el.src = src;
		el.async = true;
		el.onload = resolve;
		el.onerror = reject;
		document.head.appendChild(el);
	});
}

// Inference helpers: run CLIP zero-shot over image blob with label prompts
async function classifyImageDataUrl(dataUrl, options) {
	await ensureModelLoaded();
	const candidate_labels = buildCandidateLabels(options);
	const image = await (await fetch(dataUrl)).blob();
	const outputs = await pipelineVision(image, candidate_labels, { text_template: 'uma foto de {}' });
	if (!Array.isArray(outputs) || outputs.length === 0) return { label: 'desconhecido', score: 0 };
	return { label: outputs[0].label, score: outputs[0].score };
}

async function classifyThemeAndStyle(item) {
	const [theme, style] = await Promise.all([
		classifyImageDataUrl(item.dataUrl, THEME_OPTIONS),
		classifyImageDataUrl(item.dataUrl, STYLE_OPTIONS)
	]);
	item.theme = mapBackToCanonical(THEME_OPTIONS, theme.label);
	item.themeScore = theme.score || 0;
	item.style = mapBackToCanonical(STYLE_OPTIONS, style.label);
	item.styleScore = style.score || 0;
	applyThreshold(item);
}

function applyThreshold(item) {
	const th = parseFloat(elements.threshold.value || '0.3');
	if (!Number.isFinite(item.themeScore) || item.themeScore < th) {
		item.theme = 'desconhecido';
	}
	if (!Number.isFinite(item.styleScore) || item.styleScore < th) {
		item.style = 'desconhecido';
	}
}

function computeAutoName(item, indexOneBased) {
	const t = item.theme && item.theme !== 'desconhecido' ? item.theme : '';
	const s = item.style && item.style !== 'desconhecido' ? item.style : '';
	const nameParts = [t, s].filter(Boolean);
	const base = nameParts.length ? nameParts.join('-') : 'desconhecido';
	const slug = slugify(base);
	return `${slug}-${indexOneBased}`;
}

function render() {
	const hasItems = imageItems.length > 0;
	elements.empty.classList.toggle('hidden', hasItems);
	elements.downloadZip.disabled = !hasItems;
	elements.downloadCsv.disabled = !hasItems;
	const grid = elements.grid;
	grid.innerHTML = '';
	imageItems.forEach((item, idx) => {
		const container = document.createElement('div');
		const unknown = (item.theme === 'desconhecido' || item.style === 'desconhecido');
		container.className = 'rounded-lg border overflow-hidden flex flex-col ' + (unknown ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white');

		const img = document.createElement('img');
		img.src = item.dataUrl;
		img.alt = item.file.name;
		img.className = 'aspect-video object-cover bg-slate-100';
		container.appendChild(img);

		const body = document.createElement('div');
		body.className = 'p-3 space-y-2';

		const row1 = document.createElement('div');
		row1.className = 'grid grid-cols-2 gap-2';
		row1.appendChild(makeLabelInput('Tema', item.theme, (v) => { item.theme = v; updateName(idx); }));
		row1.appendChild(makeLabelInput('Estilo', item.style, (v) => { item.style = v; updateName(idx); }));
		body.appendChild(row1);

		const row2 = document.createElement('div');
		row2.className = 'grid grid-cols-2 gap-2 text-xs text-slate-600';
		row2.appendChild(makeConfidence('Conf. tema', item.themeScore));
		row2.appendChild(makeConfidence('Conf. estilo', item.styleScore));
		body.appendChild(row2);

		if (unknown) {
			const warn = document.createElement('div');
			warn.className = 'text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-1';
			warn.textContent = 'Abaixo do threshold: revise tema/estilo manualmente.';
			body.appendChild(warn);
		}

		const nameGroup = document.createElement('div');
		nameGroup.className = 'flex items-center gap-2';
		const nameInput = document.createElement('input');
		nameInput.type = 'text';
		nameInput.className = 'w-full px-2 py-1 border rounded';
		nameInput.value = item.nameOverride || computeAutoName(item, idx + 1);
		nameInput.addEventListener('input', () => { item.nameOverride = nameInput.value; });
		nameGroup.appendChild(nameInput);

		const resetBtn = document.createElement('button');
		resetBtn.textContent = 'Auto';
		resetBtn.className = 'px-2 py-1 text-xs rounded bg-slate-100 hover:bg-slate-200 border border-slate-200';
		resetBtn.addEventListener('click', () => {
			item.nameOverride = computeAutoName(item, idx + 1);
			nameInput.value = item.nameOverride;
		});
		nameGroup.appendChild(resetBtn);
		body.appendChild(nameGroup);

		const footer = document.createElement('div');
		footer.className = 'px-3 pb-3 flex items-center justify-between';
		const orig = document.createElement('div');
		orig.className = 'text-xs text-slate-500 truncate';
		orig.textContent = item.file.name;
		footer.appendChild(orig);

		const remove = document.createElement('button');
		remove.textContent = 'Remover';
		remove.className = 'text-xs text-red-600 hover:text-red-700';
		remove.addEventListener('click', () => {
			const ix = imageItems.findIndex(x => x.id === item.id);
			if (ix !== -1) imageItems.splice(ix, 1);
			render();
		});
		footer.appendChild(remove);

		container.appendChild(body);
		container.appendChild(footer);
		grid.appendChild(container);
	});
}

function makeLabelInput(labelText, value, onChange) {
	const wrap = document.createElement('div');
	const label = document.createElement('label');
	label.className = 'block text-xs text-slate-600 mb-1';
	label.textContent = labelText;
	wrap.appendChild(label);
	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'w-full px-2 py-1 border rounded';
	input.value = value || '';
	input.addEventListener('input', () => onChange(input.value));
	wrap.appendChild(input);
	return wrap;
}

function makeConfidence(label, score) {
	const wrap = document.createElement('div');
	const lab = document.createElement('div');
	lab.className = 'text-xs';
	lab.textContent = label;
	wrap.appendChild(lab);
	const val = document.createElement('div');
	val.className = 'font-medium';
	val.textContent = Number.isFinite(score) ? formatConfidence(score) : '—';
	wrap.appendChild(val);
	return wrap;
}

function updateName(index) {
	const item = imageItems[index];
	if (!item) return;
	// Rebuild UI element input value
	render();
}

function bindThreshold() {
	const sync = (from, to) => {
		from.addEventListener('input', () => {
			to.value = from.value;
			// Re-apply threshold to all items and update names
			imageItems.forEach((it, idx) => {
				applyThreshold(it);
				if (!it.nameOverride) {
					// Keep auto name updated if not manually set
				}
			});
			render();
		});
	};
	sync(elements.threshold, elements.thresholdNumber);
	sync(elements.thresholdNumber, elements.threshold);
}

function setupDnD() {
	const dz = elements.dropzone;
	;['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('ring-2', 'ring-brand-400'); }));
	;['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('ring-2', 'ring-brand-400'); }));
	dz.addEventListener('drop', (e) => {
		const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
		if (files.length) handleFiles(files);
	});
	elements.fileInput.addEventListener('change', (e) => {
		const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
		if (files.length) handleFiles(files);
	});
}

async function handleFiles(files) {
	for (const file of files) {
		const dataUrl = await readFileAsDataURL(file);
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const item = { id, file, dataUrl, theme: '', style: '', themeScore: NaN, styleScore: NaN, nameOverride: '' };
		imageItems.push(item);
	}
	render();
	// After initial render, classify sequentially to avoid heavy parallelism
	for (const item of imageItems) {
		if (!item.theme && !item.style) {
			try {
				await classifyThemeAndStyle(item);
				render();
			} catch (err) {
				console.error('Erro na classificação', err);
			}
		}
	}
}

function setupActions() {
	elements.clearAll.addEventListener('click', () => {
		imageItems.splice(0, imageItems.length);
		render();
	});
	elements.reclassify.addEventListener('click', async () => {
		for (const item of imageItems) {
			try {
				await classifyThemeAndStyle(item);
			} catch (e) { console.error(e); }
		}
		render();
	});
	elements.downloadCsv.addEventListener('click', () => {
		const rows = ['original,novo_nome,tema,estilo,confiança'];
		imageItems.forEach((item, idx) => {
			const auto = computeAutoName(item, idx + 1);
			const name = (item.nameOverride || auto).replace(/"/g, '""');
			const orig = item.file.name.replace(/"/g, '""');
			const conf = Math.max(Number(item.themeScore)||0, Number(item.styleScore)||0);
			const row = [orig, name, item.theme || '', item.style || '', conf]
				.map(v => typeof v === 'number' ? v.toFixed(4) : v)
				.map(v => `"${v}"`)
				.join(',');
			rows.push(row);
		});
		const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
		triggerDownload(blob, 'renomeacao.csv');
	});
			elements.downloadZip.addEventListener('click', async () => {
			const JSZipUrl = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
			if (!window.JSZip) await loadScript(JSZipUrl);
			const zip = new window.JSZip();
			for (let i = 0; i < imageItems.length; i++) {
				const item = imageItems[i];
				const auto = computeAutoName(item, i + 1);
				const nameBase = slugify((item.nameOverride || auto) || `imagem-${i+1}`);
				const ext = guessExtension(item.file.name) || 'jpg';
				const arrayBuffer = await item.file.arrayBuffer();
				zip.file(`${nameBase}.${ext}`, arrayBuffer);
			}
			const content = await zip.generateAsync({ type: 'blob' });
			triggerDownload(content, 'imagens-renomeadas.zip');
		});
}

function triggerDownload(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

function guessExtension(name) {
	const m = /\.([a-zA-Z0-9]+)$/.exec(name);
	return m ? m[1].toLowerCase() : '';
}

function init() {
	bindThreshold();
	setupDnD();
	setupActions();
	setModelStatus('aguardando imagens…');
}

init();
// Basic canvas state and tools
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const toolButtons = Array.from(document.querySelectorAll('.tool'));
const strokeColorEl = document.getElementById('strokeColor');
const fillColorEl = document.getElementById('fillColor');
const strokeWidthEl = document.getElementById('strokeWidth');
const fontSizeEl = document.getElementById('fontSize');
const textColorEl = document.getElementById('textColor');
const textEditor = document.getElementById('textEditor');
const titleInput = document.getElementById('titleInput');
const selectEl = document.getElementById('drawingSelect');
const btnNew = document.getElementById('btnNew');
const btnExport = document.getElementById('btnExport');
const btnSaveDb = document.getElementById('btnSaveDb');
const btnLoadDb = document.getElementById('btnLoadDb');
const colorSwatches = document.getElementById('colorSwatches');
const saveModal = document.getElementById('saveModal');
const optPng = document.getElementById('optPng');
const optPdf = document.getElementById('optPdf');
const optDoc = document.getElementById('optDoc');
const optCancel = document.getElementById('optCancel');
const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');

let state = {
  tool: 'brush',
  shapes: [], // each: {type, points, x,y,w,h, stroke, fill, width, text, fontSize}
  isDrawing: false,
  currentShape: null,
  selectionIndex: -1,
  pan: { x: 0, y: 0 },
  zoom: 1,
  dbId: null,
};

// History stacks
const undoStack = [];
const redoStack = [];

function serializeShapes() {
  return JSON.stringify(state.shapes);
}

function deserializeShapes(serialized) {
  try { return JSON.parse(serialized) || []; } catch { return []; }
}

function updateHistoryButtons() {
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

function pushUndoSnapshot() {
  undoStack.push(serializeShapes());
  if (undoStack.length > 100) undoStack.shift();
  updateHistoryButtons();
}

function clearRedoStack() {
  redoStack.length = 0;
  updateHistoryButtons();
}

function applyShapesFrom(serialized) {
  state.shapes = deserializeShapes(serialized);
  state.selectionIndex = -1;
  hideTextEditor();
  redraw();
}

function doUndo() {
  if (!undoStack.length) return;
  redoStack.push(serializeShapes());
  const prev = undoStack.pop();
  applyShapesFrom(prev);
  updateHistoryButtons();
}

function doRedo() {
  if (!redoStack.length) return;
  undoStack.push(serializeShapes());
  const next = redoStack.pop();
  applyShapesFrom(next);
  updateHistoryButtons();
}

function setActiveTool(tool) {
  state.tool = tool;
  toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  hideTextEditor();
}

toolButtons.forEach((b) => {
  b.addEventListener('click', () => setActiveTool(b.dataset.tool));
});
setActiveTool('brush');

// Text functionality is ready for use


// Build color swatches palette (like MS Paint)
const defaultColors = [
  // Basic colors
  '#000000','#ffffff','#7f7f7f','#c3c3c3',
  // Reds
  '#880015','#ed1c24','#ff0000','#ff4444','#ff6666','#ff9999','#ffcccc',
  // Oranges
  '#ff7f27','#ff8800','#ffaa00','#ffcc00','#ffee00',
  // Yellows
  '#fff200','#ffff00','#ffff44','#ffff88','#ffffcc',
  // Greens
  '#22b14c','#00ff00','#44ff44','#88ff88','#ccffcc','#00aa00','#006600',
  // Blues
  '#00a2e8','#0088ff','#0066ff','#0044ff','#0000ff','#4444ff','#8888ff','#ccccff',
  // Purples
  '#3f48cc','#a349a4','#8800ff','#aa44ff','#cc88ff','#6600aa','#440066',
  // Pinks
  '#ffaec9','#ff88cc','#ff44aa','#ff0088','#cc0066','#aa0044',
  // Browns
  '#b97a57','#8b4513','#a0522d','#cd853f','#daa520',
  // Grays
  '#333333','#555555','#777777','#999999','#bbbbbb','#dddddd',
  // Special colors
  '#ff1493','#00ced1','#ffd700','#ff6347','#32cd32','#1e90ff','#ff69b4','#9370db'
];
if (colorSwatches) {
  colorSwatches.innerHTML = '';
  defaultColors.forEach((c) => {
    const sw = document.createElement('button');
    sw.className = 'sw';
    sw.style.background = c;
    sw.title = `${c} (click: stroke, Alt+click: fill)`;
    sw.addEventListener('click', (e) => {
      if (e.altKey || state.tool === 'fill') {
        fillColorEl.value = c;
      } else {
        strokeColorEl.value = c;
      }
    });
    colorSwatches.appendChild(sw);
  });
}

// (Removed Apply-to-selected UI; use Fill/Stroke tools or swatches directly)

function getPointer(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (evt.clientX - rect.left) * scaleX;
  const y = (evt.clientY - rect.top) * scaleY;
  return { x, y };
}

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (const s of state.shapes) {
    drawShape(s);
  }
  if (state.selectionIndex >= 0) {
    const s = state.shapes[state.selectionIndex];
    if (s) drawSelection(s);
  }
}

function drawShape(s) {
  ctx.save();
  ctx.lineWidth = s.width || 2;
  ctx.strokeStyle = s.stroke || '#222';
  ctx.fillStyle = s.fill || 'transparent';
  switch (s.type) {
    case 'path': {
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      break;
    }
    case 'eraser': {
      // Eraser doesn't draw anything, it just erases
      return;
    }
    case 'line':
    case 'arrow': {
      const [p0, p1] = s.points;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      if (s.type === 'arrow') drawArrowHead(p0, p1, s);
      break;
    }
    case 'curve': {
      const [p0, p1, c] = s.points;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(c.x, c.y, p1.x, p1.y);
      ctx.stroke();
      break;
    }
    case 'rect': {
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'square': {
      const size = Math.min(Math.abs(s.w), Math.abs(s.h));
      const x = s.x + (s.w >= 0 ? 0 : -size);
      const y = s.y + (s.h >= 0 ? 0 : -size);
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'roundrect': {
      const r = Math.min(12, Math.abs(s.w), Math.abs(s.h)) * 0.25;
      roundedRect(ctx, s.x, s.y, s.w, s.h, r);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'circle': {
      const size = Math.min(Math.abs(s.w), Math.abs(s.h));
      const cx = s.x + (s.w >= 0 ? size/2 : -size/2);
      const cy = s.y + (s.h >= 0 ? size/2 : -size/2);
      ctx.beginPath();
      ctx.ellipse(cx, cy, size/2, size/2, 0, 0, Math.PI*2);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'diamond': {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, s.y);
      ctx.lineTo(s.x + s.w, cy);
      ctx.lineTo(cx, s.y + s.h);
      ctx.lineTo(s.x, cy);
      ctx.closePath();
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(s.x + s.w / 2, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.lineTo(s.x, s.y + s.h);
      ctx.closePath();
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'triangleRight': {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.lineTo(s.x, s.y + s.h);
      ctx.closePath();
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'triangleIso': {
      ctx.beginPath();
      ctx.moveTo(s.x + s.w/2, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.lineTo(s.x, s.y + s.h);
      ctx.closePath();
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'star': {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const outer = Math.min(Math.abs(s.w), Math.abs(s.h)) / 2;
      const inner = outer / 2.5;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const radius = i % 2 === 0 ? outer : inner;
        const px = cx + radius * Math.cos(angle);
        const py = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'star4': { drawStar(ctx, s, 4); break; }
    case 'star5': { drawStar(ctx, s, 5); break; }
    case 'star6': { drawStar(ctx, s, 6); break; }
    case 'polygon5': { drawPolygon(ctx, s, 5); break; }
    case 'polygon6': { drawPolygon(ctx, s, 6); break; }
    case 'donut': {
      const cx = s.x + s.w/2; const cy = s.y + s.h/2;
      const outer = Math.min(Math.abs(s.w), Math.abs(s.h))/2;
      const inner = outer * 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, outer, outer, 0, 0, Math.PI*2);
      ctx.fillStyle = s.fill && s.fill !== 'transparent' ? s.fill : '#00000000';
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(cx, cy, inner, inner, 0, 0, Math.PI*2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
      ctx.stroke();
      break;
    }
    case 'cross': {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.moveTo(s.x + s.w, s.y);
      ctx.lineTo(s.x, s.y + s.h);
      ctx.stroke();
      break;
    }
    case 'arrowLeft': case 'arrowRight': case 'arrowUp': case 'arrowDown': case 'arrowLR': case 'arrowUD': {
      drawArrows(ctx, s);
      break;
    }
    case 'calloutRounded': {
      const r = 10;
      const tail = { w: Math.abs(s.w)*0.18, h: Math.abs(s.h)*0.18 };
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      roundedRect(ctx, bb.x, bb.y, bb.w, bb.h - tail.h, r);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bb.x + bb.w*0.3, bb.y + bb.h - tail.h);
      ctx.lineTo(bb.x + bb.w*0.3 + tail.w*0.4, bb.y + bb.h);
      ctx.lineTo(bb.x + bb.w*0.5, bb.y + bb.h - tail.h);
      ctx.closePath();
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'calloutCloud': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const cx = bb.x + bb.w/2, cy = bb.y + bb.h/2, r = Math.min(bb.w, bb.h)/4;
      ctx.beginPath();
      for (let i=0;i<8;i++) {
        const angle = (Math.PI*2/8)*i;
        ctx.moveTo(cx + r*Math.cos(angle), cy + r*Math.sin(angle));
        ctx.arc(cx + r*1.2*Math.cos(angle), cy + r*1.2*Math.sin(angle), r, 0, Math.PI*2);
      }
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'heart': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const cx = bb.x + bb.w/2; const cy = bb.y + bb.h/2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + bb.h*0.25);
      ctx.bezierCurveTo(cx - bb.w*0.5, cy - bb.h*0.15, cx - bb.w*0.15, bb.y, cx, bb.y + bb.h*0.25);
      ctx.bezierCurveTo(cx + bb.w*0.15, bb.y, cx + bb.w*0.5, cy - bb.h*0.15, cx, cy + bb.h*0.25);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'bolt': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      ctx.beginPath();
      ctx.moveTo(bb.x + bb.w*0.55, bb.y);
      ctx.lineTo(bb.x + bb.w*0.2, bb.y + bb.h*0.6);
      ctx.lineTo(bb.x + bb.w*0.5, bb.y + bb.h*0.6);
      ctx.lineTo(bb.x + bb.w*0.45, bb.y + bb.h);
      ctx.lineTo(bb.x + bb.w*0.8, bb.y + bb.h*0.4);
      ctx.lineTo(bb.x + bb.w*0.5, bb.y + bb.h*0.4);
      ctx.closePath();
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
    case 'sun': {
      const cx = s.x + s.w/2, cy = s.y + s.h/2, r = Math.min(Math.abs(s.w), Math.abs(s.h))/4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI*2);
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      for(let i=0;i<8;i++){
        const a = (Math.PI*2/8)*i;
        ctx.beginPath();
        ctx.moveTo(cx + r*Math.cos(a), cy + r*Math.sin(a));
        ctx.lineTo(cx + r*1.8*Math.cos(a), cy + r*1.8*Math.sin(a));
        ctx.stroke();
      }
      break;
    }
    case 'moon': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const cx = bb.x + bb.w/2, cy = bb.y + bb.h/2, r = Math.min(bb.w, bb.h)/2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI*0.2, Math.PI*1.8, false);
      ctx.arc(cx + r*0.5, cy - r*0.1, r*0.8, Math.PI*1.2, Math.PI*0.8, true);
      ctx.closePath();
      if (s.fill && s.fill !== 'transparent') ctx.fill();
      ctx.stroke();
      break;
    }
  }
  if (s.text && s.text.trim() !== '') {
    // Save current state
    ctx.save();
    
    // Set text properties
    ctx.fillStyle = s.textColor || '#000000';
    ctx.font = `${s.fontSize || 18}px Arial, sans-serif`;
    
    // Get shape bounds
    const { x, y, w, h } = getShapeBBox(s);
    
    // Determine text positioning based on shape type and actual shape boundaries
    let textX, textY;
    let textAlign = 'left';
    let textBaseline = 'top';
    
    if (s.type === 'text') {
      // For standalone text shapes, use left alignment with small padding
      textX = x + 4;
      textY = y + 4;
      textAlign = 'left';
      textBaseline = 'top';
    } else {
      // For shapes with text, center the text within the actual shape boundaries
      const shapeX = x;
      const shapeY = y;
      const shapeW = Math.abs(w);
      const shapeH = Math.abs(h);
      
      textX = shapeX + shapeW / 2;
      textY = shapeY + shapeH / 2;
      textAlign = 'center';
      textBaseline = 'middle';
    }
    
    ctx.textAlign = textAlign;
    ctx.textBaseline = textBaseline;
    
    // Handle multi-line text
    const lines = s.text.split('\n');
    const lineHeight = (s.fontSize || 18) * 1.2;
    
    // Draw each line
    lines.forEach((line, index) => {
      let currentY;
      if (s.type === 'text') {
        // For standalone text, stack lines vertically from top
        currentY = textY + (index * lineHeight);
      } else {
        // For shapes, center all lines around the middle of the actual shape
        const totalHeight = lines.length * lineHeight;
        const startY = textY - totalHeight / 2 + lineHeight / 2;
        currentY = startY + (index * lineHeight);
        
        // Ensure text stays within shape boundaries
        const shapeY = y;
        const shapeH = Math.abs(h);
        const minY = shapeY + 4; // Small padding from top
        const maxY = shapeY + shapeH - 4; // Small padding from bottom
        
        if (currentY < minY) currentY = minY;
        if (currentY > maxY) currentY = maxY;
      }
      
      // Draw text with a subtle outline for better visibility
      if (s.textColor !== '#ffffff' && s.textColor !== '#FFFFFF') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeText(line, textX, currentY);
      }
      
      // Draw the main text
      ctx.fillText(line, textX, currentY);
    });
    
    // Restore state
    ctx.restore();
  }
  ctx.restore();
}

function drawArrowHead(p0, p1, s) {
  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const size = 10 + (s.width || 2);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p1.x - size * Math.cos(angle - Math.PI / 6), p1.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p1.x - size * Math.cos(angle + Math.PI / 6), p1.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawSelection(s) {
  // Only show selection outline for non-text shapes
  if (s.type === 'text') {
    return; // No selection outline for text shapes
  }
  
  const { x, y, w, h } = getShapeBBox(s);
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#4a90e2';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  ctx.restore();
}

function getShapeBBox(s) {
  if (s.type === 'path') {
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (s.type === 'line' || s.type === 'arrow') {
    const [a, b] = s.points;
    const minX = Math.min(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x, b.x);
    const maxY = Math.max(a.y, b.y);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (['triangle','triangleRight','triangleIso','star','star4','star5','star6','roundrect','diamond','ellipse','circle','rect','square','polygon5','polygon6','donut','cross','arrowLeft','arrowRight','arrowUp','arrowDown','arrowLR','arrowUD','calloutRounded','calloutCloud','heart','bolt','sun','moon'].includes(s.type)) {
    return { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
  }
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

// Build a path for a shape on the current ctx without stroking/filling
function buildPathForShape(ctx, s) {
  switch (s.type) {
    case 'path': {
      if (!s.points || s.points.length === 0) return;
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      break;
    }
    case 'eraser': {
      // Eraser doesn't draw anything, it just erases
      return;
    }
    case 'line':
    case 'arrow': {
      const [p0, p1] = s.points || [];
      if (!p0 || !p1) return;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      break;
    }
    case 'curve': {
      const [p0, p1, c] = s.points || [];
      if (!p0 || !p1 || !c) return;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(c.x, c.y, p1.x, p1.y);
      break;
    }
    case 'rect':
    case 'square': {
      const bb = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      ctx.beginPath();
      ctx.rect(bb.x, bb.y, bb.w, bb.h);
      break;
    }
    case 'roundrect': {
      const bb = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const r = Math.min(12, bb.w, bb.h) * 0.25;
      ctx.beginPath();
      roundedRect(ctx, bb.x, bb.y, bb.w, bb.h, r);
      break;
    }
    case 'ellipse': {
      const bb = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      ctx.beginPath();
      ctx.ellipse(bb.x + bb.w / 2, bb.y + bb.h / 2, bb.w / 2, bb.h / 2, 0, 0, Math.PI * 2);
      break;
    }
    case 'circle': {
      const bb = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const size = Math.min(bb.w, bb.h);
      const cx = bb.x + size/2;
      const cy = bb.y + size/2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, size/2, size/2, 0, 0, Math.PI*2);
      break;
    }
    case 'diamond': {
      const bb = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const cx = bb.x + bb.w / 2;
      const cy = bb.y + bb.h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, bb.y);
      ctx.lineTo(bb.x + bb.w, cy);
      ctx.lineTo(cx, bb.y + bb.h);
      ctx.lineTo(bb.x, cy);
      ctx.closePath();
      break;
    }
    case 'triangle': {
      const bb = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      ctx.beginPath();
      ctx.moveTo(bb.x + bb.w / 2, bb.y);
      ctx.lineTo(bb.x + bb.w, bb.y + bb.h);
      ctx.lineTo(bb.x, bb.y + bb.h);
      ctx.closePath();
      break;
    }
    case 'triangleRight': {
      const bb = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      ctx.beginPath();
      ctx.moveTo(bb.x, bb.y);
      ctx.lineTo(bb.x + bb.w, bb.y + bb.h);
      ctx.lineTo(bb.x, bb.y + bb.h);
      ctx.closePath();
      break;
    }
    case 'triangleIso': {
      const bb = { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      ctx.beginPath();
      ctx.moveTo(bb.x + bb.w/2, bb.y);
      ctx.lineTo(bb.x + bb.w, bb.y + bb.h);
      ctx.lineTo(bb.x, bb.y + bb.h);
      ctx.closePath();
      break;
    }
    case 'star':
    case 'star4':
    case 'star5':
    case 'star6': {
      // Use drawStar helper for non-4/5/6? We rebuild minimal polygonal star paths
      const points = s.type === 'star4' ? 4 : s.type === 'star5' ? 5 : s.type === 'star6' ? 6 : 5;
      const cx = s.x + s.w/2, cy = s.y + s.h/2;
      const outer = Math.min(Math.abs(s.w), Math.abs(s.h))/2;
      const inner = outer/2.5;
      ctx.beginPath();
      for (let i=0;i<points*2;i++){
        const angle = (Math.PI/(points)) * i - Math.PI/2;
        const radius = i % 2 === 0 ? outer : inner;
        const px = cx + radius * Math.cos(angle);
        const py = cy + radius * Math.sin(angle);
        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      break;
    }
    case 'polygon5':
    case 'polygon6': {
      const sides = s.type === 'polygon5' ? 5 : 6;
      const cx = s.x + s.w/2, cy = s.y + s.h/2;
      const r = Math.min(Math.abs(s.w), Math.abs(s.h))/2;
      ctx.beginPath();
      for (let i=0;i<sides;i++){
        const angle = (Math.PI*2/sides)*i - Math.PI/2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      break;
    }
    case 'donut': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const cx = bb.x + bb.w/2; const cy = bb.y + bb.h/2;
      const outer = Math.min(bb.w, bb.h)/2;
      const inner = outer * 0.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, outer, outer, 0, 0, Math.PI*2);
      ctx.moveTo(cx + inner, cy);
      ctx.ellipse(cx, cy, inner, inner, 0, 0, Math.PI*2);
      break;
    }
    case 'cross': {
      // Treat as two diagonals; not fillable
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.moveTo(s.x + s.w, s.y);
      ctx.lineTo(s.x, s.y + s.h);
      break;
    }
    case 'arrowLeft': case 'arrowRight': case 'arrowUp': case 'arrowDown': case 'arrowLR': case 'arrowUD': {
      // Use bounding box arrows path approximation (strokes, not filled)
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      ctx.beginPath();
      ctx.rect(bb.x, bb.y, bb.w, bb.h);
      break;
    }
    case 'calloutRounded': {
      const r = 10;
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const tailH = bb.h*0.18;
      ctx.beginPath();
      roundedRect(ctx, bb.x, bb.y, bb.w, bb.h - tailH, r);
      ctx.moveTo(bb.x + bb.w*0.3, bb.y + bb.h - tailH);
      ctx.lineTo(bb.x + bb.w*0.3 + bb.w*0.18*0.4, bb.y + bb.h);
      ctx.lineTo(bb.x + bb.w*0.5, bb.y + bb.h - tailH);
      ctx.closePath();
      break;
    }
    case 'calloutCloud': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const cx = bb.x + bb.w/2, cy = bb.y + bb.h/2, r = Math.min(bb.w, bb.h)/4;
      ctx.beginPath();
      for (let i=0;i<8;i++) {
        const angle = (Math.PI*2/8)*i;
        ctx.moveTo(cx + r*Math.cos(angle), cy + r*Math.sin(angle));
        ctx.arc(cx + r*1.2*Math.cos(angle), cy + r*1.2*Math.sin(angle), r, 0, Math.PI*2);
      }
      break;
    }
    case 'heart': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const cx = bb.x + bb.w/2; const cy = bb.y + bb.h/2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + bb.h*0.25);
      ctx.bezierCurveTo(cx - bb.w*0.5, cy - bb.h*0.15, cx - bb.w*0.15, bb.y, cx, bb.y + bb.h*0.25);
      ctx.bezierCurveTo(cx + bb.w*0.15, bb.y, cx + bb.w*0.5, cy - bb.h*0.15, cx, cy + bb.h*0.25);
      ctx.closePath();
      break;
    }
    case 'bolt': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      ctx.beginPath();
      ctx.moveTo(bb.x + bb.w*0.55, bb.y);
      ctx.lineTo(bb.x + bb.w*0.2, bb.y + bb.h*0.6);
      ctx.lineTo(bb.x + bb.w*0.5, bb.y + bb.h*0.6);
      ctx.lineTo(bb.x + bb.w*0.45, bb.y + bb.h);
      ctx.lineTo(bb.x + bb.w*0.8, bb.y + bb.h*0.4);
      ctx.lineTo(bb.x + bb.w*0.5, bb.y + bb.h*0.4);
      ctx.closePath();
      break;
    }
    case 'sun': {
      const cx = s.x + s.w/2, cy = s.y + s.h/2, r = Math.min(Math.abs(s.w), Math.abs(s.h))/4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI*2);
      break;
    }
    case 'moon': {
      const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
      const cx = bb.x + bb.w/2, cy = bb.y + bb.h/2, r = Math.min(bb.w, bb.h)/2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI*0.2, Math.PI*1.8, false);
      ctx.arc(cx + r*0.5, cy - r*0.1, r*0.8, Math.PI*1.2, Math.PI*0.8, true);
      ctx.closePath();
      break;
    }
  }
}

function hitTestFillPoint(p) {
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const s = state.shapes[i];
    ctx.save();
    buildPathForShape(ctx, s);
    let inside = ctx.isPointInPath(p.x, p.y);
    if (!inside) {
      // Also allow clicking on the stroke/outline of closed shapes
      ctx.lineWidth = (s.width || 2) + 4; // a little tolerance
      inside = ctx.isPointInStroke(p.x, p.y);
    }
    ctx.restore();
    if (inside) return i;
  }
  return -1;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    const m = ctx.measureText(test);
    if (m.width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const totalHeight = lines.length * lineHeight * 1.2;
  let offsetY = y - totalHeight / 2 + lineHeight / 2;
  for (const l of lines) {
    ctx.fillText(l, x, offsetY);
    offsetY += lineHeight * 1.2;
  }
}

// AI Tools Handler
function handleAITool(tool, p) {
  console.log('AI Tool activated:', tool, 'at position:', p);
  console.log('Current state.shapes length:', state.shapes.length);
  
  pushUndoSnapshot();
  clearRedoStack();
  
  switch (tool) {
    case 'aiAutoComplete':
      // AI Auto Complete - suggests completing partial shapes
      const hit = hitTest(p);
      console.log('Hit test result:', hit, 'at position:', p);
      console.log('Available shapes:', state.shapes.map((s, i) => ({index: i, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h})));
      
      if (hit >= 0) {
        const shape = state.shapes[hit];
        console.log('Found shape for completion:', shape);
        
        // Handle different shape types
        if (shape.type === 'square' || shape.type === 'circle' || shape.type === 'rect' || shape.type === 'ellipse') {
          // For existing shapes, enhance them or make them more perfect
          console.log('Enhancing existing shape:', shape.type);
          
          if (shape.type === 'square' || shape.type === 'rect') {
            // Make it a perfect square
            const size = Math.max(Math.abs(shape.w), Math.abs(shape.h));
            shape.x = shape.x + (shape.w - size) / 2;
            shape.y = shape.y + (shape.h - size) / 2;
            shape.w = size;
            shape.h = size;
            shape.type = 'square';
            console.log('Enhanced to perfect square');
          } else if (shape.type === 'circle' || shape.type === 'ellipse') {
            // Make it a perfect circle
            const size = Math.max(Math.abs(shape.w), Math.abs(shape.h));
            shape.x = shape.x + (shape.w - size) / 2;
            shape.y = shape.y + (shape.h - size) / 2;
            shape.w = size;
            shape.h = size;
            shape.type = 'circle';
            console.log('Enhanced to perfect circle');
          }
          
        } else if (shape.type === 'path' && shape.points && shape.points.length > 2) {
          // Analyze the path to determine what shape it should be
          const analysis = analyzePathShape(shape.points);
          console.log('Path analysis:', analysis);
          
          if (analysis.suggestedType === 'square') {
            // Complete as a perfect square
            const { minX, minY, maxX, maxY } = analysis.bounds;
            const size = Math.max(maxX - minX, maxY - minY);
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            
            // Replace with perfect square
            shape.type = 'square';
            shape.x = centerX - size/2;
            shape.y = centerY - size/2;
            shape.w = size;
            shape.h = size;
            delete shape.points; // Remove path points
            console.log('Completed as perfect square');
            
          } else if (analysis.suggestedType === 'circle') {
            // Complete as a perfect circle
            const { minX, minY, maxX, maxY } = analysis.bounds;
            const size = Math.max(maxX - minX, maxY - minY);
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            
            // Replace with perfect circle
            shape.type = 'circle';
            shape.x = centerX - size/2;
            shape.y = centerY - size/2;
            shape.w = size;
            shape.h = size;
            delete shape.points; // Remove path points
            console.log('Completed as perfect circle');
            
          } else {
            // Complete the path normally
            const firstPoint = shape.points[0];
            const lastPoint = shape.points[shape.points.length - 1];
            const distance = Math.sqrt(Math.pow(lastPoint.x - firstPoint.x, 2) + Math.pow(lastPoint.y - firstPoint.y, 2));
            
            if (distance < 50) {
              shape.points.push({x: firstPoint.x, y: firstPoint.y});
              console.log('Path completed!');
            } else {
              const midX = (firstPoint.x + lastPoint.x) / 2;
              const midY = (firstPoint.y + lastPoint.y) / 2;
              const controlX = midX + (Math.random() - 0.5) * 20;
              const controlY = midY + (Math.random() - 0.5) * 20;
              
              shape.points.push({x: controlX, y: controlY});
              shape.points.push({x: firstPoint.x, y: firstPoint.y});
              console.log('Path completed with curve!');
            }
          }
        } else if (shape.type === 'line') {
          // Complete a line into a triangle or rectangle
          const [p1, p2] = shape.points;
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
          
          if (distance > 30) {
            // Create a triangle
            const p3 = {
              x: midX + (Math.random() - 0.5) * distance,
              y: midY + (Math.random() - 0.5) * distance
            };
            shape.points.push(p3);
            shape.points.push({x: p1.x, y: p1.y}); // Close the triangle
            shape.type = 'path';
            console.log('Line completed to triangle!');
          }
        }
      } else {
        // If no shape found, create a simple completion
        console.log('No shape found, creating new completion');
        const completionShape = {
          type: 'square',
          x: p.x - 25,
          y: p.y - 25,
          w: 50,
          h: 50,
          stroke: strokeColorEl.value,
          fill: fillColorEl.value,
          width: parseInt(strokeWidthEl.value, 10) || 2
        };
        state.shapes.push(completionShape);
        console.log('Created completion square');
      }
      
      // Always show feedback for AI Auto Complete
      showAIFeedback('aiAutoComplete');
      break;
      
    case 'aiColorize':
      // AI Colorize - automatically applies smart colors
      const colorizeHit = hitTest(p);
      if (colorizeHit >= 0) {
        const shape = state.shapes[colorizeHit];
        const smartColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
        const randomColor = smartColors[Math.floor(Math.random() * smartColors.length)];
        shape.fill = randomColor;
        shape.stroke = '#333';
        console.log('Applied AI colorize to existing shape:', shape);
      } else {
        console.log('No shape found for colorize at:', p, '- AI Color Fill only works on existing shapes');
        // Don't create new shapes - only work on existing ones
        showAIFeedback('aiColorize', 'No shape found to colorize');
      }
      break;
      
    case 'aiEnhance':
      // AI Enhance - improves shape quality
      const enhanceHit = hitTest(p);
      if (enhanceHit >= 0) {
        const shape = state.shapes[enhanceHit];
        if (shape.type === 'path') {
          // Smooth the path
          shape.points = smoothPath(shape.points);
        }
        // Enhance stroke width
        shape.width = Math.max(shape.width || 2, 3);
        console.log('Applied AI enhance to existing shape:', shape);
      } else {
        console.log('No shape found for enhance at:', p, '- AI Enhance only works on existing shapes');
        showAIFeedback('aiEnhance', 'No shape found to enhance');
      }
      break;
      
    case 'aiGenerate':
      // AI Generate - creates random artistic elements
      console.log('AI Generate activated at:', p);
      
      // Create a simple circle first to test
      const aiShape = {
        type: 'circle',
        x: p.x - 25,
        y: p.y - 25,
        w: 50,
        h: 50,
        stroke: '#ff0000',
        fill: '#ffcccc',
        width: 3
      };
      
      state.shapes.push(aiShape);
      console.log('AI Generated circle:', aiShape);
      console.log('Total shapes now:', state.shapes.length);
      break;
      
    case 'aiStyle':
      // AI Style Transfer - applies artistic styles
      const styleHit = hitTest(p);
      if (styleHit >= 0) {
        const shape = state.shapes[styleHit];
        const styles = [
          {stroke: '#ff0000', fill: '#ffcccc', width: 4},
          {stroke: '#0000ff', fill: '#ccccff', width: 3},
          {stroke: '#00ff00', fill: '#ccffcc', width: 5},
          {stroke: '#ff00ff', fill: '#ffccff', width: 2}
        ];
        const randomStyle = styles[Math.floor(Math.random() * styles.length)];
        Object.assign(shape, randomStyle);
        console.log('Applied AI style to existing shape:', shape);
      } else {
        console.log('No shape found for style at:', p, '- AI Style only works on existing shapes');
        showAIFeedback('aiStyle', 'No shape found to style');
      }
      break;
  }
  
  // Show feedback that AI tool worked
  showAIFeedback(tool);
  redraw();
}

// Show AI feedback
function showAIFeedback(tool, customMessage = null) {
  const messages = {
    'aiAutoComplete': 'AI completed your shape!',
    'aiColorize': 'AI applied smart colors!',
    'aiEnhance': 'AI enhanced your drawing!',
    'aiGenerate': 'AI generated a new shape!',
    'aiStyle': 'AI applied artistic style!'
  };
  
  // Create temporary feedback element
  const feedback = document.createElement('div');
  feedback.textContent = customMessage || messages[tool] || 'AI tool activated!';
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4a90e2;
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    z-index: 1000;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(feedback);
  
  // Remove after 2 seconds
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.parentNode.removeChild(feedback);
    }
  }, 2000);
}

// Helper function to smooth paths
function smoothPath(points) {
  if (points.length < 3) return points;
  
  const smoothed = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    const smoothX = (prev.x + curr.x + next.x) / 3;
    const smoothY = (prev.y + curr.y + next.y) / 3;
    smoothed.push({x: smoothX, y: smoothY});
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

// Analyze a path to determine what shape it should be
function analyzePathShape(points) {
  if (points.length < 3) return { suggestedType: 'path', bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  
  // Calculate bounds
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  // Check if it looks like a square (roughly equal width/height, rectangular pattern)
  const aspectRatio = Math.abs(width - height) / Math.max(width, height);
  const isRoughlySquare = aspectRatio < 0.3; // Within 30% of being square
  
  // Check if it looks like a circle (points roughly equidistant from center)
  let circleScore = 0;
  const avgRadius = Math.max(width, height) / 2;
  for (const point of points) {
    const distance = Math.sqrt(Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2));
    const radiusDiff = Math.abs(distance - avgRadius) / avgRadius;
    if (radiusDiff < 0.4) circleScore++; // Within 40% of expected radius
  }
  const isRoughlyCircle = circleScore / points.length > 0.6; // 60% of points fit circle pattern
  
  // Determine suggested type
  let suggestedType = 'path';
  if (isRoughlySquare && width > 20 && height > 20) {
    suggestedType = 'square';
  } else if (isRoughlyCircle && avgRadius > 15) {
    suggestedType = 'circle';
  }
  
  console.log('Path analysis:', {
    points: points.length,
    width, height, aspectRatio,
    isRoughlySquare, isRoughlyCircle,
    circleScore: circleScore / points.length,
    suggestedType
  });
  
  return {
    suggestedType,
    bounds: { minX, minY, maxX, maxY },
    centerX, centerY,
    width, height
  };
}

// Erase parts of shapes that intersect with the eraser
function eraseShapesAtPoint(point, eraserSize) {
  const eraserRadius = eraserSize / 2;
  
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const shape = state.shapes[i];
    
    if (shape.type === 'path' && shape.points) {
      // For paths, remove points that are within eraser radius
      const originalLength = shape.points.length;
      shape.points = shape.points.filter(p => {
        const distance = Math.sqrt(Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2));
        return distance > eraserRadius;
      });
      
      // If too many points were removed, delete the entire shape
      if (shape.points.length < 2 || shape.points.length < originalLength * 0.3) {
        state.shapes.splice(i, 1);
        console.log('Erased entire path shape');
      }
    } else if (shape.type === 'line' && shape.points && shape.points.length >= 2) {
      // For lines, check if eraser intersects the line
      const [p1, p2] = shape.points;
      const distToLine = distanceToLine(point, p1, p2);
      if (distToLine < eraserRadius) {
        state.shapes.splice(i, 1);
        console.log('Erased line shape');
      }
    } else if (shape.x !== undefined && shape.y !== undefined && shape.w !== undefined && shape.h !== undefined) {
      // For other shapes, check if eraser center is within shape bounds
      const left = Math.min(shape.x, shape.x + shape.w);
      const right = Math.max(shape.x, shape.x + shape.w);
      const top = Math.min(shape.y, shape.y + shape.h);
      const bottom = Math.max(shape.y, shape.y + shape.h);
      
      if (point.x >= left - eraserRadius && point.x <= right + eraserRadius && 
          point.y >= top - eraserRadius && point.y <= bottom + eraserRadius) {
        state.shapes.splice(i, 1);
        console.log('Erased shape:', shape.type);
      }
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  const p = getPointer(e);
  console.log('Mouse down at:', p, 'Current tool:', state.tool);
  
  // Close text editor if it's open before handling new mouse events
  if (!textEditor.classList.contains('hidden')) {
    hideTextEditor();
  }
  
  const common = {
    stroke: strokeColorEl.value,
    fill: fillColorEl.value,
    width: parseInt(strokeWidthEl.value, 10) || 2,
    fontSize: parseInt(fontSizeEl.value, 10) || 18,
  };
  
  // Handle AI tools
  if (state.tool === 'aiAutoComplete' || state.tool === 'aiColorize' || 
      state.tool === 'aiEnhance' || state.tool === 'aiGenerate' || state.tool === 'aiStyle') {
    console.log('AI tool detected, calling handleAITool');
    handleAITool(state.tool, p);
    return;
  }
  
  if (state.tool === 'brush') {
    pushUndoSnapshot();
    clearRedoStack();
    state.isDrawing = true;
    state.currentShape = {
      type: 'path',
      points: [p],
      ...common,
      stroke: common.stroke,
    };
    state.shapes.push(state.currentShape);
  } else if (state.tool === 'eraser') {
    // Eraser should actually erase parts of existing shapes
    pushUndoSnapshot();
    clearRedoStack();
    state.isDrawing = true;
    state.currentShape = {
      type: 'eraser',
      points: [p],
      width: parseInt(strokeWidthEl.value, 10) || 10, // Eraser size
    };
    // Don't add eraser as a shape, just use it to erase
  } else if (state.tool === 'line' || state.tool === 'arrow') {
    pushUndoSnapshot();
    clearRedoStack();
    state.isDrawing = true;
    state.currentShape = { type: state.tool, points: [p, p], ...common };
    state.shapes.push(state.currentShape);
  } else if (state.tool === 'curve') {
    pushUndoSnapshot();
    clearRedoStack();
    state.isDrawing = true;
    // points: [start, end, control]
    state.currentShape = { type: 'curve', points: [p, p, p], phase: 0, ...common };
    state.shapes.push(state.currentShape);
  } else if ([
    'rect','roundrect','ellipse','circle','square','diamond',
    'triangle','triangleRight','triangleIso',
    'star','star4','star5','star6',
    'polygon5','polygon6','donut','cross',
    'arrowLeft','arrowRight','arrowUp','arrowDown','arrowLR','arrowUD',
    'calloutRounded','calloutCloud','heart','bolt','sun','moon'
  ].includes(state.tool)) {
    pushUndoSnapshot();
    clearRedoStack();
    state.isDrawing = true;
    state.currentShape = { type: state.tool, x: p.x, y: p.y, w: 0, h: 0, ...common };
    state.shapes.push(state.currentShape);
  } else if (state.tool === 'text') {
    const hit = hitTest(p);
    
    if (hit >= 0) {
      const shape = state.shapes[hit];
      // If it's already a text shape, edit it
      if (shape.type === 'text') {
        state.selectionIndex = hit;
        openTextEditor(shape);
        redraw();
      } else {
        // Add text to existing shape
        if (shape.text === undefined) {
          shape.text = '';
          shape.fontSize = parseInt(fontSizeEl.value, 10) || 18;
          shape.textColor = textColorEl.value;
        }
        state.selectionIndex = hit;
        openTextEditor(shape);
        redraw();
      }
    } else {
      // Create new text shape at the click point
      pushUndoSnapshot();
      clearRedoStack();
      const fontSize = parseInt(fontSizeEl.value, 10) || 18;
      const textWidth = Math.max(100, fontSize * 4); // Dynamic width based on font size
      const textHeight = Math.max(30, fontSize + 10); // Dynamic height based on font size
      
      const newTextShape = {
        type: 'text',
        x: p.x - textWidth / 2, // Center the text around the click point
        y: p.y - textHeight / 2,
        w: textWidth,
        h: textHeight,
        text: '', // Start with empty text
        fontSize: fontSize,
        textColor: textColorEl.value,
        stroke: 'transparent', // No border for text by default
        fill: 'transparent',
        width: 0
      };
      state.shapes.push(newTextShape);
      state.selectionIndex = state.shapes.length - 1;
      openTextEditor(newTextShape);
      redraw();
    }
  } else if (state.tool === 'select') {
    state.selectionIndex = hitTest(p);
    redraw();
  } else if (state.tool === 'fill') {
    let idx = hitTestFillPoint(p);
    if (idx < 0) idx = hitTest(p); // fallback to bbox if needed
    if (idx >= 0) {
      pushUndoSnapshot();
      clearRedoStack();
      const s = state.shapes[idx];
      s.fill = fillColorEl.value;
      state.selectionIndex = idx;
      redraw();
    }
  } else if (state.tool === 'stroke') {
    let idx = hitTestFillPoint(p);
    if (idx < 0) idx = hitTest(p);
    if (idx >= 0) {
      pushUndoSnapshot();
      clearRedoStack();
      const s = state.shapes[idx];
      s.stroke = strokeColorEl.value;
      state.selectionIndex = idx;
      redraw();
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!state.isDrawing || !state.currentShape) return;
  const p = getPointer(e);
  const s = state.currentShape;
  
  if (s.type === 'eraser') {
    // Erase parts of existing shapes that intersect with eraser path
    s.points.push(p);
    eraseShapesAtPoint(p, s.width);
  } else if (s.type === 'path') {
    s.points.push(p);
  } else if (s.type === 'line' || s.type === 'arrow') {
    s.points[1] = p;
  } else if (s.type === 'curve') {
    if (s.phase === 0) {
      s.points[1] = p; // end point
    } else {
      s.points[2] = p; // control
    }
  } else {
    s.w = p.x - s.x;
    s.h = p.y - s.y;
  }
  redraw();
});

window.addEventListener('mouseup', () => {
  if (state.currentShape && state.currentShape.type === 'curve') {
    if (state.currentShape.phase === 0) {
      state.currentShape.phase = 1; // next drag defines control point
      return;
    }
  }
  
  // Handle eraser completion
  if (state.currentShape && state.currentShape.type === 'eraser') {
    // Eraser is done, clean up
    state.isDrawing = false;
    state.currentShape = null;
    return;
  }
  
  // Apply AI enhancement to newly created shapes if AI tool is active
  if (state.currentShape && (state.tool === 'aiColorize' || state.tool === 'aiEnhance' || state.tool === 'aiStyle')) {
    applyAIToCurrentShape();
  }
  
  state.isDrawing = false;
  state.currentShape = null;
});

// Apply AI to the current shape being drawn
function applyAIToCurrentShape() {
  if (!state.currentShape) return;
  
  const shape = state.currentShape;
  
  switch (state.tool) {
    case 'aiColorize':
      const smartColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
      const randomColor = smartColors[Math.floor(Math.random() * smartColors.length)];
      shape.fill = randomColor;
      shape.stroke = '#333';
      console.log('Applied AI colorize to new shape');
      break;
      
    case 'aiEnhance':
      shape.width = Math.max(shape.width || 2, 4);
      console.log('Applied AI enhance to new shape');
      break;
      
    case 'aiStyle':
      const styles = [
        {stroke: '#ff0000', fill: '#ffcccc', width: 4},
        {stroke: '#0000ff', fill: '#ccccff', width: 3},
        {stroke: '#00ff00', fill: '#ccffcc', width: 5}
      ];
      const randomStyle = styles[Math.floor(Math.random() * styles.length)];
      Object.assign(shape, randomStyle);
      console.log('Applied AI style to new shape');
      break;
  }
  
  showAIFeedback(state.tool);
}

function hitTest(p) {
  console.log('Hit testing at:', p, 'with', state.shapes.length, 'shapes');
  
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const s = state.shapes[i];
    console.log(`Testing shape ${i}:`, s.type, s);
    
    // Use the more accurate hitTestFillPoint for better detection
    const hit = hitTestFillPoint(p);
    if (hit >= 0) {
      console.log(`Hit shape ${hit} using fill point test`);
      return hit;
    }
    
    // Fallback to bounding box for shapes that might not work with fill test
    const { x, y, w, h } = getShapeBBox(s);
    if (p.x >= x && p.x <= x + Math.abs(w) && p.y >= y && p.y <= y + Math.abs(h)) {
      console.log(`Hit shape ${i} using bounding box:`, {x, y, w, h});
      return i;
    }
  }
  console.log('No hit found');
  return -1;
}

function openTextEditor(shape) {
  const { x, y, w, h } = getShapeBBox(shape);
  const rect = canvas.getBoundingClientRect();
  const fontSize = shape.fontSize || 18;
  
  textEditor.classList.remove('hidden');
  textEditor.style.position = 'fixed';
  
  // Position text editor based on the actual drawn shape boundaries
  if (shape.type === 'text') {
    // For standalone text, use the exact text area
    textEditor.style.left = `${rect.left + x}px`;
    textEditor.style.top = `${rect.top + y}px`;
    textEditor.style.width = `${Math.max(80, Math.abs(w))}px`;
    textEditor.style.height = `${Math.max(30, Math.abs(h))}px`;
    textEditor.style.textAlign = 'left';
  } else {
    // For shapes, use the exact shape boundaries
    const shapeX = x;
    const shapeY = y;
    const shapeW = Math.abs(w);
    const shapeH = Math.abs(h);
    
    // Position editor to match the shape exactly
    textEditor.style.left = `${rect.left + shapeX}px`;
    textEditor.style.top = `${rect.top + shapeY}px`;
    textEditor.style.width = `${shapeW}px`;
    textEditor.style.height = `${shapeH}px`;
    textEditor.style.textAlign = 'center';
  }
  
  textEditor.value = shape.text || '';
  textEditor.style.fontSize = `${fontSize}px`;
  textEditor.style.color = shape.textColor || '#000000';
  textEditor.style.fontFamily = 'Arial, sans-serif';
  textEditor.style.fontWeight = 'normal';
  textEditor.style.lineHeight = '1.2';
  textEditor.style.border = 'none';
  textEditor.style.borderRadius = '6px';
  textEditor.style.padding = '6px';
  textEditor.style.backgroundColor = 'transparent';
  textEditor.style.boxShadow = 'none';
  
  // Sync the text color picker with the shape's text color
  if (shape.textColor) {
    textColorEl.value = shape.textColor;
  }
  
  // Sync the font size control
  if (fontSize) {
    fontSizeEl.value = fontSize;
  }
  
  textEditor.readOnly = false;
  textEditor.disabled = false;
  textEditor.style.zIndex = '1000';
  textEditor.style.pointerEvents = 'auto';
  
  // Select all text for easy replacement
  setTimeout(() => {
    textEditor.focus();
    textEditor.select();
  }, 0);
}

function hideTextEditor() {
  if (textEditor.classList.contains('hidden')) return;
  
  const idx = state.selectionIndex;
  
  if (idx >= 0 && idx < state.shapes.length) {
    const s = state.shapes[idx];
    const newText = textEditor.value || '';
    
    // Always save the text, even if it's empty
    if ((s.text || '') !== newText) {
      pushUndoSnapshot();
      clearRedoStack();
      s.text = newText;
      
      // If text is empty, remove the text shape entirely
      if (newText.trim() === '') {
        state.shapes.splice(idx, 1);
      }
    }
  }
  
  textEditor.classList.add('hidden');
  textEditor.value = '';
  // Clear selection so blue outline doesn't remain after finishing text
  state.selectionIndex = -1;
  redraw();
}

textEditor.addEventListener('blur', hideTextEditor);

// Add keyboard shortcuts for text editing
textEditor.addEventListener('keydown', (e) => {
  // Enter key to add new line
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const cursorPos = textEditor.selectionStart;
    const textBefore = textEditor.value.substring(0, cursorPos);
    const textAfter = textEditor.value.substring(cursorPos);
    textEditor.value = textBefore + '\n' + textAfter;
    
    // Move cursor to after the newline
    const newCursorPos = cursorPos + 1;
    textEditor.setSelectionRange(newCursorPos, newCursorPos);
  }
  
  // Escape key to finish editing
  if (e.key === 'Escape') {
    e.preventDefault();
    hideTextEditor();
  }
  
  // Tab key to finish editing (alternative to clicking away)
  if (e.key === 'Tab') {
    e.preventDefault();
    hideTextEditor();
  }
});

btnExport.addEventListener('click', () => {
  saveModal.classList.remove('hidden');
});

optCancel.addEventListener('click', () => saveModal.classList.add('hidden'));

optPng.addEventListener('click', () => {
  // Export exactly what is on screen with a solid white background,
  // and keep the on-screen view unchanged afterwards.
  const w = canvas.width, h = canvas.height;
  const originalBitmap = ctx.getImageData(0, 0, w, h);
  const originalSelection = state.selectionIndex;

  // Render a clean frame without selection outlines
  state.selectionIndex = -1;
  redraw();
  // Paint white behind current drawing (CSS bg isn't included in PNG)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const link = document.createElement('a');
  link.download = `${titleInput.value || 'drawing'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();

  // Restore the exact on-screen pixels and selection state
  ctx.putImageData(originalBitmap, 0, 0);
  state.selectionIndex = originalSelection;
  saveModal.classList.add('hidden');
});

optPdf.addEventListener('click', () => {
  const { jsPDF } = window.jspdf || window.jspdf || {};
  if (!jsPDF) { alert('PDF library failed to load'); return; }
  const pdf = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });
  const img = canvas.toDataURL('image/png');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(img, 'PNG', x, y, w, h);
  pdf.save(`${titleInput.value || 'drawing'}.pdf`);
  saveModal.classList.add('hidden');
});

optDoc.addEventListener('click', () => {
  const img = canvas.toDataURL('image/png');
  const html = `<!doctype html><html><body><img src="${img}" style="max-width:100%"/></body></html>`;
  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${titleInput.value || 'drawing'}.doc`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  saveModal.classList.add('hidden');
});

// Save to DB
btnSaveDb.addEventListener('click', async () => {
  const payload = {
    title: titleInput.value || 'Untitled',
    data: { shapes: state.shapes },
    imageDataUrl: canvas.toDataURL('image/png'),
  };
  try {
    const res = await fetch(state.dbId ? `/api/drawings/${state.dbId}` : '/api/drawings', {
      method: state.dbId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    state.dbId = json._id;
    await refreshList();
    alert('Saved');
  } catch (e) {
    console.error(e);
    alert('Save failed');
  }
});

btnLoadDb.addEventListener('click', async () => {
  const id = selectEl.value;
  if (!id) return;
  try {
    const res = await fetch(`/api/drawings/${id}`);
    const json = await res.json();
    state.dbId = json._id;
    titleInput.value = json.title || 'Untitled';
    if (state.shapes.length) pushUndoSnapshot();
    state.shapes = (json.data && json.data.shapes) || [];
    clearRedoStack();
    hideTextEditor();
    redraw();
  } catch (e) {
    console.error(e);
  }
});

btnNew.addEventListener('click', () => {
  if (state.shapes.length) pushUndoSnapshot();
  clearRedoStack();
  state = { ...state, shapes: [], dbId: null, selectionIndex: -1 };
  titleInput.value = '';
  hideTextEditor();
  redraw();
});

// Font size and text color controls
fontSizeEl.addEventListener('input', () => {
  if (state.selectionIndex >= 0) {
    const shape = state.shapes[state.selectionIndex];
    if (shape.text !== undefined) {
      shape.fontSize = parseInt(fontSizeEl.value, 10) || 18;
      textEditor.style.fontSize = `${shape.fontSize}px`;
      redraw();
    }
  }
});

textColorEl.addEventListener('input', () => {
  if (state.selectionIndex >= 0) {
    const shape = state.shapes[state.selectionIndex];
    if (shape.text !== undefined) {
      shape.textColor = textColorEl.value;
      textEditor.style.color = shape.textColor;
      redraw();
    }
  }
});

async function refreshList() {
  try {
    const res = await fetch('/api/drawings');
    const list = await res.json();
    selectEl.innerHTML = '<option value="">Select saved drawing...</option>' +
      list.map((d) => `<option value="${d._id}">${(d.title || 'Untitled')} — ${new Date(d.updatedAt).toLocaleString()}</option>`).join('');
  } catch (e) {
    console.error(e);
  }
}

refreshList();
redraw();

// Undo/Redo buttons
if (btnUndo) btnUndo.addEventListener('click', () => doUndo());
if (btnRedo) btnRedo.addEventListener('click', () => doRedo());
updateHistoryButtons();

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const ctrl = isMac ? e.metaKey : e.ctrlKey;
  // If typing in the text editor, don't hijack shortcuts except undo/redo inside the field
  if (!ctrl) {
    return;
  }
  if (document.activeElement === textEditor) {
    // Allow default text editing shortcuts inside the editor
    return;
  }
  if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  } else if (e.key.toLowerCase() === 'z' && e.shiftKey) {
    e.preventDefault();
    doRedo();
  } else if (e.key.toLowerCase() === 'y') {
    e.preventDefault();
    doRedo();
  }
});
function roundedRect(ctx, x, y, w, h, r) {
  const signW = Math.sign(w) || 1;
  const signH = Math.sign(h) || 1;
  const rx = Math.min(Math.abs(w) / 2, r) * signW;
  const ry = Math.min(Math.abs(h) / 2, r) * signH;
  const x0 = x, y0 = y, x1 = x + w, y1 = y + h;
  ctx.beginPath();
  ctx.moveTo(x0 + rx, y0);
  ctx.lineTo(x1 - rx, y0);
  ctx.quadraticCurveTo(x1, y0, x1, y0 + ry);
  ctx.lineTo(x1, y1 - ry);
  ctx.quadraticCurveTo(x1, y1, x1 - rx, y1);
  ctx.lineTo(x0 + rx, y1);
  ctx.quadraticCurveTo(x0, y1, x0, y1 - ry);
  ctx.lineTo(x0, y0 + ry);
  ctx.quadraticCurveTo(x0, y0, x0 + rx, y0);
}

function drawStar(ctx, s, points) {
  const cx = s.x + s.w/2, cy = s.y + s.h/2;
  const outer = Math.min(Math.abs(s.w), Math.abs(s.h))/2;
  const inner = outer/2.5;
  ctx.beginPath();
  for (let i=0;i<points*2;i++){
    const angle = (Math.PI/(points)) * i - Math.PI/2;
    const radius = i % 2 === 0 ? outer : inner;
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath();
  if (s.fill && s.fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function drawPolygon(ctx, s, sides) {
  const cx = s.x + s.w/2, cy = s.y + s.h/2;
  const r = Math.min(Math.abs(s.w), Math.abs(s.h))/2;
  ctx.beginPath();
  for (let i=0;i<sides;i++){
    const angle = (Math.PI*2/sides)*i - Math.PI/2;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath();
  if (s.fill && s.fill !== 'transparent') ctx.fill();
  ctx.stroke();
}

function drawArrows(ctx, s) {
  const bb = { x: Math.min(s.x,s.x+s.w), y: Math.min(s.y,s.y+s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
  const cx = bb.x + bb.w/2, cy = bb.y + bb.h/2;
  ctx.lineCap = 'butt';
  const drawArrow = (x0,y0,x1,y1) => {
    ctx.beginPath();
    ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    const angle = Math.atan2(y1-y0, x1-x0);
    const size = 8 + (s.width||2);
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x1 - size*Math.cos(angle-Math.PI/6), y1 - size*Math.sin(angle-Math.PI/6));
    ctx.moveTo(x1,y1);
    ctx.lineTo(x1 - size*Math.cos(angle+Math.PI/6), y1 - size*Math.sin(angle+Math.PI/6));
    ctx.stroke();
  };
  if (s.type === 'arrowLeft' || s.type === 'arrowLR') drawArrow(bb.x+bb.w, cy, bb.x, cy);
  if (s.type === 'arrowRight' || s.type === 'arrowLR') drawArrow(bb.x, cy, bb.x+bb.w, cy);
  if (s.type === 'arrowUp' || s.type === 'arrowUD') drawArrow(cx, bb.y+bb.h, cx, bb.y);
  if (s.type === 'arrowDown' || s.type === 'arrowUD') drawArrow(cx, bb.y, cx, bb.y+bb.h);
}

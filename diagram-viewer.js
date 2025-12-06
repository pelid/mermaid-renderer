// Вспомогательные функции
function calculateOptimalViewBox(bbox, containerWidth, containerHeight) {
  // Вычисляем подходящий масштаб для вписывания в контейнер
  const scaleX = containerWidth / bbox.width;
  const scaleY = containerHeight / bbox.height;
  const initialScale = Math.min(scaleX, scaleY) * 0.9; // 90% от вписывающего масштаба

  // Вычисляем viewBox для центрирования и масштабирования
  const scaledWidth = bbox.width * initialScale;
  const scaledHeight = bbox.height * initialScale;

  // Центрируем схему в контейнере
  const offsetX = (containerWidth - scaledWidth) / 2 / initialScale;
  const offsetY = (containerHeight - scaledHeight) / 2 / initialScale;

  return {
    zoom: initialScale,
    viewBox: {
      x: bbox.x - offsetX,
      y: bbox.y - offsetY,
      w: bbox.width + offsetX * 2,
      h: bbox.height + offsetY * 2
    }
  };
}

export class DiagramViewer {
  constructor(containerElement, options = {}) {
    if (!containerElement || !(containerElement instanceof HTMLElement)) {
      console.error('DiagramViewer: containerElement must be a valid DOM element');
      return;
    }

    this.container = containerElement;

    this.svg = this.container.querySelector('svg');
    if (!this.svg) {
      console.error('SVG element not found in container');
      return;
    }

    // Удаляем inline-стили max-width/max-height, установленные Mermaid
    this.svg.style.maxWidth = 'none';
    this.svg.style.maxHeight = 'none';

    this.options = {
      showControls: true,
      showHint: true,
      minZoom: 0.1,
      maxZoom: 5,
      zoomStep: 1.15,
      ...options
    };

    this.zoom = 1;
    this.viewBox = { x: 0, y: 0, w: 100, h: 100 };
    this.panning = false;
    this.lastX = 0;
    this.lastY = 0;

    const bbox = this.svg.getBBox();

    // Используем вспомогательную функцию для вычисления оптимального viewBox
    const { zoom, viewBox } = calculateOptimalViewBox(
      bbox,
      this.container.clientWidth,
      this.container.clientHeight
    );

    this.zoom = zoom;
    this.viewBox = viewBox;
    this.updateView();

    if (this.options.showControls) this.addControls();
    if (this.options.showHint) this.addHint();

    this.setupEvents();
  }

  addControls() {
    const controls = document.createElement('div');
    controls.className = 'absolute top-4 right-4 z-10 flex items-center space-x-2 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 p-1 shadow-sm';
    controls.innerHTML = `
      <button class="p-1.5 rounded hover:bg-gray-100 text-gray-600">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
        </svg>
      </button>
      <span class="text-sm text-gray-700 font-medium min-w-[50px] text-center">100%</span>
      <button class="p-1.5 rounded hover:bg-gray-100 text-gray-600">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <button class="ml-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
        Сброс
      </button>
    `;

    this.controlsElement = controls;
    this.container.appendChild(controls);

    const buttons = controls.querySelectorAll('button');

    if (buttons.length >= 3) {
      buttons[0].onclick = () => this.zoomAt(0.5, 0.5, -1);
      buttons[1].onclick = () => this.zoomAt(0.5, 0.5, 1);
      buttons[2].onclick = () => this.reset();
    }
  }

  addHint() {
    const hint = document.createElement('div');
    hint.className = 'absolute bottom-2 right-2 z-10 text-xs text-gray-500 bg-white/80 px-2 py-1 rounded border border-gray-200';
    hint.textContent = 'Управление: колесо мыши — зум, средняя кнопка — панорамирование';
    this.hintElement = hint;
    this.container.appendChild(hint);
  }

  setupEvents() {
    this.container.onwheel = (e) => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      this.zoomAt(px, py, e.deltaY < 0 ? 1 : -1);
    };

    this.container.onmousedown = (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.panning = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.container.style.cursor = 'grabbing';
      }
    };

    this.container.onmouseup = () => {
      if (this.panning) {
        this.panning = false;
        this.container.style.cursor = 'default';
      }
    };

    this.container.onmousemove = (e) => {
      if (!this.panning) return;

      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      this.viewBox.x -= dx * (this.viewBox.w / this.container.clientWidth);
      this.viewBox.y -= dy * (this.viewBox.h / this.container.clientHeight);
      this.updateView();
    };
  }

  zoomAt(px, py, dir) {
    const newZoom = Math.max(this.options.minZoom,
      Math.min(this.options.maxZoom, this.zoom * (dir > 0 ? this.options.zoomStep : 1/this.options.zoomStep)));
    const ratio = this.zoom / newZoom;
    this.zoom = newZoom;

    const worldX = this.viewBox.x + px * this.viewBox.w;
    const worldY = this.viewBox.y + py * this.viewBox.h;

    this.viewBox.w *= ratio;
    this.viewBox.h *= ratio;
    this.viewBox.x = worldX - px * this.viewBox.w;
    this.viewBox.y = worldY - py * this.viewBox.h;

    this.updateView();
  }

  updateView() {
    this.svg.setAttribute('viewBox',
      `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`
    );

    if (this.controlsElement) {
      const zoomLevel = this.controlsElement.querySelector('span');
      if (zoomLevel) {
        zoomLevel.textContent = `${Math.round(this.zoom * 100)}%`;
      }
    }
  }

   reset() {
    const bbox = this.svg.getBBox();

    // Используем вспомогательную функцию для вычисления оптимального viewBox
    const { zoom, viewBox } = calculateOptimalViewBox(
      bbox,
      this.container.clientWidth,
      this.container.clientHeight
    );

    this.zoom = zoom;
    this.viewBox = viewBox;
    this.updateView();
  }

  destroy() {
    if (this.controlsElement) this.controlsElement.remove();
    if (this.hintElement) this.hintElement.remove();

    this.container.onwheel = null;
    this.container.onmousedown = null;
    this.container.onmouseup = null;
    this.container.onmousemove = null;
    this.container.style.cursor = '';
  }
}

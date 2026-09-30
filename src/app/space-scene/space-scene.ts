import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';

type Star = { x: number; y: number; z: number };
type Planet = {
  name: string;
  x: number;
  y: number;
  size: number;
  color: string;
  description: string;
};

@Component({
  selector: 'app-space-scene',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './space-scene.component.html',
  styleUrls: ['./space-scene.component.css'],
})
export class SpaceSceneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('starfield', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private get win(): Window | null {
    return this.doc?.defaultView ?? null;
  }

  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  private camera = { ox: 0, oy: 0, zoom: 1 };
  private flightRaf = 0;

  private stars: Star[] = [];
  private starCount = 900;
  private rafId = 0;
  private running = false;
  private ro?: ResizeObserver;
  private planetNodes: HTMLElement[] = [];

  planets: Planet[] = [
    {
      name: 'Marte',
      x: -380,
      y: -180,
      size: 64,
      color: 'radial-gradient(circle at 40% 40%, #ff9f1c, #c0392b 70%)',
      description: 'Planeta rojo, conocido como el Planeta de los Dioses.',
    },
    {
      name: 'Neptuno',
      x: 320,
      y: -120,
      size: 54,
      color: 'radial-gradient(circle at 30% 30%, #8be9fd, #1b6ca8 70%)',
      description: 'Planeta azul, el octavo planeta del sistema solar.',
    },
    {
      name: 'Jupiter',
      x: 40,
      y: 170,
      size: 72,
      color: 'radial-gradient(circle at 60% 40%, #ffe66d, #e67e22 70%)',
      description: 'Planeta gigante, el quinto planeta del sistema solar.',
    },
  ];

  selected = signal<Planet | null>(null);

  ngAfterViewInit() {
    if (!this.isBrowser || !this.win) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas.');
    this.ctx = ctx;

    this.planetNodes = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[data-planet]'),
    );

    const parent = canvas.parentElement ?? canvas;
    if ('ResizeObserver' in this.win) {
      this.ro = new ResizeObserver(() => this.onResize());
      this.ro.observe(parent);
    }

    this.onResize();
    this.win.addEventListener('resize', this.onResize);

    this.initStars();
    this.running = true;
    this.tick();
  }

  ngOnDestroy() {
    if (!this.isBrowser || !this.win) return;
    this.running = false;
    if (this.rafId) this.win.cancelAnimationFrame(this.rafId);
    if (this.flightRaf) this.win.cancelAnimationFrame(this.flightRaf);
    this.win.removeEventListener('resize', this.onResize);
    this.ro?.disconnect();
  }

  private initStars() {
    const spread = 4000;
    this.stars = Array.from({ length: this.starCount }, () => ({
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread,
      z: Math.random() * 1.0 + 0.2,
    }));
  }

  private tick = () => {
    if (!this.running || !this.win) return;
    this.rafId = this.win.requestAnimationFrame(this.tick);

    const ctx = this.ctx;
    const { ox, oy, zoom } = this.camera;
    ctx.clearRect(0, 0, this.width, this.height);

    const grd = ctx.createRadialGradient(
      this.width * 0.7,
      this.height * 0.3,
      0,
      this.width * 0.7,
      this.height * 0.3,
      Math.max(this.width, this.height),
    );
    grd.addColorStop(0, 'rgba(64,105,225,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.width, this.height);

    const now = this.win.performance.now();
    for (const s of this.stars) {
      const px = (s.x - ox) * (zoom * s.z) + this.width / 2;
      const py = (s.y - oy) * (zoom * s.z) + this.height / 2;
      if (px < -2 || px > this.width + 2 || py < -2 || py > this.height + 2) continue;

      const size = Math.max(0.6, 1.2 * zoom * (1.3 - s.z));
      const tw = 0.7 + 0.3 * Math.sin((s.x + s.y + now * 0.002) * 0.01);
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      ctx.fillRect(px, py, size, size);
    }

    for (let i = 0; i < this.planetNodes.length; i++) {
      const p = this.planets[i];
      const sx = (p.x - ox) * zoom + this.width / 2;
      const sy = (p.y - oy) * zoom + this.height / 2;
      this.planetNodes[i].style.transform =
        `translate(${sx - p.size / 2}px, ${sy - p.size / 2}px) scale(${zoom})`;
    }
  };

  private flyCamera(target: { ox: number; oy: number; zoom: number }, onDone?: () => void) {
    if (!this.isBrowser || !this.win) return;
    const win = this.win;

    if (this.flightRaf) win.cancelAnimationFrame(this.flightRaf);

    const start = { ...this.camera };
    const duration = 2000;
    const t0 = win.performance.now();

    const step = (now: number) => {
      const raw = Math.min(1, (now - t0) / duration);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2; // easeInOut

      this.camera.ox = lerp(start.ox, target.ox, t);
      this.camera.oy = lerp(start.oy, target.oy, t);
      this.camera.zoom = lerp(start.zoom, target.zoom, t);

      if (raw < 1) this.flightRaf = win.requestAnimationFrame(step);
      else {
        this.flightRaf = 0;
        if (onDone) onDone();
      }
    };
    this.flightRaf = win.requestAnimationFrame(step);
  }

  flyTo(p: Planet) {
    this.selected.set(null);

    const targetZoom = 180 / p.size;

    this.flyCamera({ ox: p.x, oy: p.y, zoom: targetZoom }, () => this.selected.set(p));
  }

  flyHome() {
    this.selected.set(null);
    this.flyCamera({ ox: 0, oy: 0, zoom: 1 });
  }

  private onResize = () => {
    if (!this.isBrowser || !this.win) return;

    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement ?? canvas;

    const rect = parent.getBoundingClientRect();
    let w = Math.round(rect.width);
    let h = Math.round(rect.height);
    if (w === 0 || h === 0) {
      w = parent.clientWidth;
      h = parent.clientHeight;
    }
    if (w === 0 || h === 0) {
      w = this.win.innerWidth;
      h = this.win.innerHeight;
    }

    this.width = Math.max(1, w);
    this.height = Math.max(1, h);

    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;

    const dpr = Math.min(this.win.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(this.width * dpr));
    canvas.height = Math.max(1, Math.round(this.height * dpr));

    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

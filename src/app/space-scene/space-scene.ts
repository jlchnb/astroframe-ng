import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { animate } from 'motion';

type Star = { x: number; y: number; z: number };
type Planet = { name: string; left: number; top: number; size: number; color: string };

@Component({
  selector: 'app-space-scene',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './space-scene.component.html',
  styleUrls: ['./space-scene.component.css'],
})
export class SpaceSceneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('starfield', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private get win(): Window | null {
    return this.doc?.defaultView ?? null;
  }

  private ctx!: CanvasRenderingContext2D;
  private width = 0; // tamaño CSS visible
  private height = 0; // tamaño CSS visible

  private camera = { ox: 0, oy: 0, zoom: 1 };

  private stars: Star[] = [];
  private starCount = 900;
  private rafId = 0;
  private running = false;
  private ro?: ResizeObserver;

  planets: Planet[] = [
    {
      name: 'Ares',
      left: 120,
      top: 120,
      size: 64,
      color: 'radial-gradient(circle at 40% 40%, #ff9f1c, #c0392b 70%)',
    },
    {
      name: 'Naiad',
      left: 760,
      top: 220,
      size: 54,
      color: 'radial-gradient(circle at 30% 30%, #8be9fd, #1b6ca8 70%)',
    },
    {
      name: 'Helia',
      left: 420,
      top: 420,
      size: 72,
      color: 'radial-gradient(circle at 60% 40%, #ffe66d, #e67e22 70%)',
    },
  ];

  ngAfterViewInit() {
    if (!this.isBrowser || !this.win) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas.');
    this.ctx = ctx;

    // Observa el contenedor para re-ajustar cuando cambie su tamaño real
    const host = canvas.parentElement ?? canvas;
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(() => this.onResize());
      this.ro.observe(host);
    }

    this.onResize(); // ajusta CSS + buffer + DPR
    this.win.addEventListener('resize', this.onResize);

    this.initStars();
    this.running = true;
    this.tick();
  }

  ngOnDestroy() {
    if (!this.isBrowser || !this.win) return;
    this.running = false;
    if (this.rafId) this.win.cancelAnimationFrame(this.rafId);
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
    // limpia con unidades CSS (transform ya incluye DPR)
    ctx.clearRect(0, 0, this.width, this.height);

    // halo sutil
    const grd = ctx.createRadialGradient(
      this.width * 0.7,
      this.height * 0.3,
      0,
      this.width * 0.7,
      this.height * 0.3,
      Math.max(this.width, this.height)
    );
    grd.addColorStop(0, 'rgba(64,105,225,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.width, this.height);

    const now = this.win.performance.now();
    for (const s of this.stars) {
      const px = (s.x - this.camera.ox) * (this.camera.zoom * s.z) + this.width / 2;
      const py = (s.y - this.camera.oy) * (this.camera.zoom * s.z) + this.height / 2;
      if (px < -2 || px > this.width + 2 || py < -2 || py > this.height + 2) continue;

      const size = Math.max(0.6, 1.2 * this.camera.zoom * (1.3 - s.z));
      const tw = 0.7 + 0.3 * Math.sin((s.x + s.y + now * 0.002) * 0.01);
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      ctx.fillRect(px, py, size, size);
    }
  };

  flyTo(p: Planet) {
    if (!this.isBrowser) return;
    const start = { ...this.camera };
    const px = p.left + p.size / 2;
    const py = p.top + p.size / 2;

    const targetOx = start.ox + (px - this.width / 2) / start.zoom;
    const targetOy = start.oy + (py - this.height / 2) / start.zoom;
    const targetZoom = Math.min(start.zoom * 1.4, 2.2);

    animate(
      { t: 0 },
      { t: 1 },
      {
        duration: 2.0,
        ease: 'easeInOut',
        onUpdate: (latest) => {
          const t = (latest.t as number) ?? 0;
          this.camera.ox = lerp(start.ox, targetOx, t);
          this.camera.oy = lerp(start.oy, targetOy, t);
          this.camera.zoom = lerp(start.zoom, targetZoom, t);
        },
      }
    );
  }

  private onResize = () => {
    if (!this.isBrowser || !this.win) return;

    const canvas = this.canvasRef.nativeElement;
    const host = canvas.parentElement ?? canvas;

    // 1) intenta con el rect del host
    let rect = host.getBoundingClientRect();
    let w = Math.round(rect.width);
    let h = Math.round(rect.height);

    // 2) fallback a clientWidth/Height si sigue 0
    if (w === 0 || h === 0) {
      w = host.clientWidth;
      h = host.clientHeight;
    }
    // 3) último recurso: viewport
    if (w === 0 || h === 0) {
      w = this.win.innerWidth;
      h = this.win.innerHeight;
    }

    this.width = Math.max(1, w);
    this.height = Math.max(1, h);

    // fuerza tamaño CSS explícito
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;

    const dpr = Math.min(this.win.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(this.width * dpr));
    canvas.height = Math.max(1, Math.round(this.height * dpr));

    // normaliza coordenadas a unidades CSS
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

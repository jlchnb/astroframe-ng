import { Component, signal } from '@angular/core';
import { SpaceSceneComponent } from './space-scene/space-scene';

@Component({
  selector: 'app-root',
  imports: [SpaceSceneComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('astroframe-ng');
}

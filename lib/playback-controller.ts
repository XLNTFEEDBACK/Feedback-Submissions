import type { TrackProvider } from "./track-links";

export interface PlaybackAdapter {
  load: (source: string, generation: number) => void;
  play: () => void | Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
}

export class PlaybackController {
  private readonly adapters = new Map<TrackProvider, PlaybackAdapter>();
  private activeProvider: TrackProvider | null = null;
  private activeGeneration = 0;

  register(provider: TrackProvider, adapter: PlaybackAdapter) {
    this.adapters.set(provider, adapter);
    return () => {
      if (this.adapters.get(provider) === adapter) {
        this.adapters.delete(provider);
      }
    };
  }

  activate(provider: TrackProvider, generation: number) {
    this.getActiveAdapter()?.pause();
    this.activeProvider = provider;
    this.activeGeneration = generation;
  }

  isCurrent(generation: number) {
    return generation === this.activeGeneration;
  }

  load(provider: TrackProvider, source: string, generation: number) {
    if (provider !== this.activeProvider || !this.isCurrent(generation)) {
      return false;
    }
    this.adapters.get(provider)?.load(source, generation);
    return true;
  }

  play() {
    return this.getActiveAdapter()?.play();
  }

  pause() {
    this.getActiveAdapter()?.pause();
  }

  seek(seconds: number) {
    this.getActiveAdapter()?.seek(Math.max(0, seconds));
  }

  setVolume(volume: number) {
    this.getActiveAdapter()?.setVolume(
      Math.min(100, Math.max(0, Math.round(volume))),
    );
  }

  clear() {
    this.getActiveAdapter()?.pause();
    this.activeProvider = null;
    this.activeGeneration += 1;
  }

  private getActiveAdapter() {
    return this.activeProvider ? this.adapters.get(this.activeProvider) : undefined;
  }
}

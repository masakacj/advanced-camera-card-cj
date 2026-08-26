export interface AdvancedCameraCardPTTTarget {
  unmute(): Promise<void>;
  mute(): void;
  isAvailable(): boolean;
  isSupported(): boolean;
  isForbidden(): boolean;
}

const targets = new Map<string, WeakRef<AdvancedCameraCardPTTTarget>>();
const listeners = new Set<() => void>();

const notifyListeners = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const registerPTTTarget = (
  cardID: string,
  target: AdvancedCameraCardPTTTarget,
): void => {
  targets.set(cardID, new WeakRef(target));
  notifyListeners();
};

export const unregisterPTTTarget = (
  cardID: string,
  target: AdvancedCameraCardPTTTarget,
): void => {
  if (targets.get(cardID)?.deref() !== target) {
    return;
  }

  targets.delete(cardID);
  notifyListeners();
};

export const getPTTTarget = (
  cardID: string,
): AdvancedCameraCardPTTTarget | undefined => {
  const target = targets.get(cardID)?.deref();
  if (!target) {
    targets.delete(cardID);
  }
  return target;
};

export const subscribePTTTargets = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

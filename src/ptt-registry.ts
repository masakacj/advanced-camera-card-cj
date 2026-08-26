export interface AdvancedCameraCardPTTTarget {
  pttStart(): Promise<void>;
  pttStop(): void;
  isPTTAvailable(): boolean;
  isPTTActive(): boolean;
  isForbidden(): boolean;
}

export interface AdvancedCameraCardPTTTransportTarget
  extends AdvancedCameraCardPTTTarget {
  bindSender(sender: RTCRtpSender): void;
  unbindSender(sender: RTCRtpSender): void;
}

const targets = new Map<string, WeakRef<AdvancedCameraCardPTTTransportTarget>>();
const senders = new Map<string, WeakRef<RTCRtpSender>>();
const listeners = new Set<() => void>();

const notifyListeners = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const getTransportTarget = (
  cardID: string,
): AdvancedCameraCardPTTTransportTarget | undefined => {
  const target = targets.get(cardID)?.deref();
  if (!target) {
    targets.delete(cardID);
  }
  return target;
};

const getSender = (cardID: string): RTCRtpSender | undefined => {
  const sender = senders.get(cardID)?.deref();
  if (!sender) {
    senders.delete(cardID);
  }
  return sender;
};

export const registerPTTTarget = (
  cardID: string,
  target: AdvancedCameraCardPTTTransportTarget,
): void => {
  const previousTarget = getTransportTarget(cardID);
  const sender = getSender(cardID);

  if (previousTarget && previousTarget !== target && sender) {
    previousTarget.unbindSender(sender);
  }

  targets.set(cardID, new WeakRef(target));
  if (sender) {
    target.bindSender(sender);
  }
  notifyListeners();
};

export const unregisterPTTTarget = (
  cardID: string,
  target: AdvancedCameraCardPTTTransportTarget,
): void => {
  if (getTransportTarget(cardID) !== target) {
    return;
  }

  const sender = getSender(cardID);
  if (sender) {
    target.unbindSender(sender);
  }

  targets.delete(cardID);
  notifyListeners();
};

export const registerPTTSender = (cardID: string, sender: RTCRtpSender): void => {
  const previousSender = getSender(cardID);
  if (previousSender === sender) {
    return;
  }

  const target = getTransportTarget(cardID);
  if (previousSender && target) {
    target.unbindSender(previousSender);
  }

  senders.set(cardID, new WeakRef(sender));
  target?.bindSender(sender);
  notifyListeners();
};

export const unregisterPTTSender = (cardID: string, sender: RTCRtpSender): void => {
  if (getSender(cardID) !== sender) {
    return;
  }

  getTransportTarget(cardID)?.unbindSender(sender);
  senders.delete(cardID);
  notifyListeners();
};

export const notifyPTTTargetStateChanged = (
  cardID: string,
  target: AdvancedCameraCardPTTTransportTarget,
): void => {
  if (getTransportTarget(cardID) === target) {
    notifyListeners();
  }
};

export const getPTTTarget = (cardID: string): AdvancedCameraCardPTTTarget | undefined =>
  getTransportTarget(cardID);

export const subscribePTTTargets = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/* eslint-disable no-restricted-imports */

/* WARNING!
 * Make sure all re-exported functions survive in a spoofed/broken environment:
 * use only ::safe() globals that are initialized in a corresponding safe-globals* file,
 * use __proto__:null or get/set own props explicitly. */

export {
  dumpScriptValue,
  isEmpty,
} from '#/common';
export * from '#/common/consts';

export const fireBridgeEvent = (eventId, msg, cloneInto) => {
  const detail = cloneInto ? cloneInto(msg, document) : msg;
  const evtMain = new CustomEventSafe(eventId, { __proto__: null, detail });
  window::fire(evtMain);
};

export const bindEvents = (srcId, destId, bridge, cloneInto) => {
  /* Using a separate event for `node` because CustomEvent can't transfer nodes,
   * whereas MouseEvent (and some others) can't transfer objects without stringification. */
  let incomingNodeEvent;
  window::on(srcId, e => {
    e::stopImmediatePropagation();
    if (process.env.DEBUG) {
      console.info(`[bridge.${bridge.ids ? 'host' : 'guest.web'}] received`,
        incomingNodeEvent ? e::getRelatedTarget() : e::getDetail());
    }
    if (!incomingNodeEvent) {
      // CustomEvent is the main message
      const data = e::getDetail();
      incomingNodeEvent = data.node && data;
      if (!incomingNodeEvent) bridge.onHandle(data);
    } else {
      // MouseEvent is the second event when the main event has `node: true`
      incomingNodeEvent.node = e::getRelatedTarget();
      bridge.onHandle(incomingNodeEvent);
      incomingNodeEvent = null;
    }
  }, true);
  bridge.post = (cmd, data, { dataKey } = bridge, node) => {
    // Constructing the event now so we don't send anything if it throws on invalid `node`
    const evtNode = node && new MouseEventSafe(destId, { __proto__: null, relatedTarget: node });
    fireBridgeEvent(destId, { cmd, data, dataKey, node: !!evtNode }, cloneInto);
    if (evtNode) window::fire(evtNode);
  };
};

import React, { useState, useRef, useEffect, useCallback, cloneElement, Children, useLayoutEffect } from 'react';
import PropTypes from 'prop-types';
import objectAssign from 'object-assign';
import omit from 'object.omit';
import Core from './lib/ElementRelativeCursorPosition';
import addEventListener from './utils/addEventListener';
import {
  INTERACTIONS,
  MOUSE_EMULATION_GUARD_TIMER_NAME
} from './constants';
import noop from './utils/noop';
import PressActivation from './lib/PressActivation';
import TouchActivation from './lib/TouchActivation';
import TapActivation from './lib/TapActivation';
import HoverActivation from './lib/HoverActivation';
import ClickActivation from './lib/ClickActivation';

export { INTERACTIONS };

const ReactCursorPosition = ({
  activationInteractionMouse,
  activationInteractionTouch,
  children,
  className,
  hoverDelayInMs,
  hoverOffDelayInMs,
  isEnabled,
  mapChildProps,
  onActivationChanged,
  onDetectedEnvironmentChanged,
  onPositionChanged,
  pressDurationInMs,
  pressMoveThreshold,
  shouldDecorateChildren,
  shouldStopTouchMovePropagation,
  style,
  tapDurationInMs,
  tapMoveThreshold,
}) => {
  const [detectedEnvironment, setDetectedEnvironment] = useState({
    isMouseDetected: false,
    isTouchDetected: false
  });
  const [elementDimensions, setElementDimensions] = useState({
    width: 0,
    height: 0
  });
  const [isActive, setIsActive] = useState(false);
  const [isPositionOutside, setIsPositionOutside] = useState(true);
  const [position, setPosition] = useState({
    x: 0,
    y: 0
  });

  const shouldGuardAgainstMouseEmulationByDevices = useRef(false);
  const eventListeners = useRef([]);
  const timers = useRef([]);
  const elementOffset = useRef({
    x: 0,
    y: 0
  });
  const elRef = useRef(null);
  const coreRef = useRef(null);
  const touchActivationRef = useRef(null);

  const onTouchDetected = useCallback(() => {
    // Handle touch detection logic
    console.log('Touch detected!');
  }, []);

  const onTouchStart = useCallback((e) => {
    init();
    onTouchDetected();
    setShouldGuardAgainstMouseEmulationByDevices(true);

    const touchPosition = coreRef.current.getCursorPosition(getTouchEvent(e));
    setPositionState(touchPosition);

    touchActivationRef.current.touchStarted({ e, position: touchPosition });
  }, [onTouchDetected, init, setShouldGuardAgainstMouseEmulationByDevices, coreRef, getTouchEvent]);

  const onTouchMove = useCallback((e) => {
    if (!coreRef.current) {
      return;
    }

    const touchPosition = coreRef.current.getCursorPosition(getTouchEvent(e));
    touchActivationRef.current.touchMoved({ e, position: touchPosition });

    if (!isActive) {
      return;
    }

    setPositionState(touchPosition);
    e.preventDefault();

    if (shouldStopTouchMovePropagation) {
      e.stopPropagation();
    }
  }, [isActive, shouldStopTouchMovePropagation, setPositionState, coreRef, touchActivationRef, getTouchEvent]);

  const onTouchEnd = useCallback(() => {
    touchActivationRef.current.touchEnded();
    unsetShouldGuardAgainstMouseEmulationByDevices();
  }, [touchActivationRef, unsetShouldGuardAgainstMouseEmulationByDevices]);

  const onTouchCancel = useCallback(() => {
    touchActivationRef.current.touchCanceled();
    unsetShouldGuardAgainstMouseEmulationByDevices();
  }, [touchActivationRef, unsetShouldGuardAgainstMouseEmulationByDevices]);

  const onMouseEnter = useCallback((e) => {
    if (shouldGuardAgainstMouseEmulationByDevices.current) {
      return;
    }

    init();
    onMouseDetected();
    setPositionState(coreRef.current.getCursorPosition(e));
    mouseActivationRef.current.mouseEntered();
  }, [shouldGuardAgainstMouseEmulationByDevices, init, onMouseDetected, setPositionState, coreRef]);

  const onMouseMove = useCallback((e) => {
    if (!coreRef.current) {
      return;
    }

    const mousePosition = coreRef.current.getCursorPosition(e);
    setPositionState(mousePosition);
    mouseActivationRef.current.mouseMoved(mousePosition);
  }, [coreRef, setPositionState, mouseActivationRef]);

  const onMouseLeave = useCallback(() => {
    mouseActivationRef.current.mouseLeft();
    setIsPositionOutside(true);
  }, [mouseActivationRef]);

  const onClick = useCallback((e) => {
    setPositionState(coreRef.current.getCursorPosition(e));
    mouseActivationRef.current.mouseClicked();
    onMouseDetected();
  }, [coreRef, setPositionState, mouseActivationRef, onMouseDetected]);

  const onIsActiveChanged = useCallback(({ isActive }) => {
    if (isActive) {
      activate();
    } else {
      deactivate();
    }
  }, [activate, deactivate]);

  const init = useCallback(() => {
    coreRef.current = new Core(elRef.current);
    setElementDimensions(getElementDimensions(elRef.current));
  }, []);

  const setTouchActivationStrategy = useCallback((interaction) => {
    const {
      pressDurationInMs,
      pressMoveThreshold,
      tapDurationInMs,
      tapMoveThreshold
    } = {
      pressDurationInMs,
      pressMoveThreshold,
      tapDurationInMs,
      tapMoveThreshold
    };

    const {
      TOUCH,
      TAP,
      PRESS
    } = INTERACTIONS;

    switch (interaction) {
      case PRESS:
        touchActivationRef.current = new PressActivation({
          onIsActiveChanged,
          pressDurationInMs,
          pressMoveThreshold
        });
        break;
      case TAP:
        touchActivationRef.current = new TapActivation({
          onIsActiveChanged,
          tapDurationInMs,
          tapMoveThreshold
        });
        break;
      case TOUCH:
        touchActivationRef.current = new TouchActivation({
          onIsActiveChanged
        });
        break;
      default:
        throw new Error('Must implement a touch activation strategy');
    }
  }, [onIsActiveChanged, touchActivationRef]);

  const setMouseActivationStrategy = useCallback((interaction) => {
    const {
      hoverDelayInMs,
      hoverOffDelayInMs
    } = {
      hoverDelayInMs,
      hoverOffDelayInMs
    };

    const {
      HOVER,
      CLICK
    } = INTERACTIONS;

    switch (interaction) {
      case HOVER:
        mouseActivationRef.current = new HoverActivation({
          onIsActiveChanged,
          hoverDelayInMs,
          hoverOffDelayInMs
        });
        break;
      case CLICK:
        mouseActivationRef.current = new ClickActivation({
          onIsActiveChanged
        });
        break;
      default:
        throw new Error('Must implement a mouse activation strategy');
    }
  }, [onIsActiveChanged, mouseActivationRef]);

  const reset = useCallback(() => {
    const {
      core: {
        lastEvent: lastMouseEvent
      } = {}
    } = coreRef.current || {};

    init();

    if (!lastMouseEvent) {
      return;
    }

    setPositionState(coreRef.current.getCursorPosition(lastMouseEvent));
  }, [init, setPositionState, coreRef]);

  const activate = useCallback(() => {
    setIsActive(true);
    onActivationChanged({ isActive: true });

    const isActiveEnvironment = detectedEnvironment.isTouchDetected || detectedEnvironment.isMouseDetected;

    if (isActiveEnvironment) {
      setDetectedEnvironmentState({
        isMouseDetected: true,
        isTouchDetected: true
      });
    }

    const {
      core: {
        lastEvent: lastMouseEvent
      } = {}
    } = coreRef.current || {};

    if (!lastMouseEvent) {
      return;
    }

    setPositionState(coreRef.current.getCursorPosition(lastMouseEvent));
  }, [setIsActive, onActivationChanged, setDetectedEnvironmentState, setPositionState, coreRef, detectedEnvironment]);

  const deactivate = useCallback(() => {
    setIsActive(false);
    onActivationChanged({ isActive: false });
  }, [setIsActive, onActivationChanged]);

  const enable = useCallback(() => {
    const {
      activationInteractionMouse,
      activationInteractionTouch
    } = {
      activationInteractionMouse,
      activationInteractionTouch
    };

    const { MOUSE, TOUCH } = INTERACTIONS;

    addEventListeners();

    setMouseActivationStrategy(activationInteractionMouse || MOUSE);
    setTouchActivationStrategy(activationInteractionTouch || TOUCH);

    coreRef.current = new Core(elRef.current);
    setElementDimensions(getElementDimensions(elRef.current));

    if (isEnabled) {
      activate();
    }
  }, [isEnabled, activate, setMouseActivationStrategy, setTouchActivationStrategy, coreRef, addEventListeners]);

  const disable = useCallback(() => {
    deactivate();
    removeEventListeners();
  }, [deactivate, removeEventListeners]);

  const setPositionState = useCallback((position) => {
    if (isPositionOutside === position.isOutside) {
      return;
    }

    setIsPositionOutside(position.isOutside);

    if (onPositionChanged) {
      onPositionChanged(position);
    }
  }, [isPositionOutside, setIsPositionOutside, onPositionChanged]);

  const setDetectedEnvironmentState = useCallback((environment) => {
    const hasDetectedEnvironmentChanged =
      environment.isMouseDetected !== detectedEnvironment.isMouseDetected ||
      environment.isTouchDetected !== detectedEnvironment.isTouchDetected;

    if (hasDetectedEnvironmentChanged) {
      setDetectedEnvironment(environment);

      if (onDetectedEnvironmentChanged) {
        onDetectedEnvironmentChanged(environment);
      }
    }
  }, [detectedEnvironment, setDetectedEnvironment, onDetectedEnvironmentChanged]);

  const removeEventListeners = useCallback(() => {
    eventListeners.current.forEach((listener) => listener.remove());
    eventListeners.current = [];
  }, [eventListeners]);

  const unsetShouldGuardAgainstMouseEmulationByDevices = useCallback(() => {
    shouldGuardAgainstMouseEmulationByDevices.current = false;
  }, [shouldGuardAgainstMouseEmulationByDevices]);

  const getElementDimensions = useCallback((el) => {
    const { width, height } = el.getBoundingClientRect();
    return { width, height };
  }, []);

  const decorateChildren = useCallback((child, childProps) => {
    if (!shouldDecorateChildren) {
      return child;
    }

    return cloneElement(child, childProps);
  }, [shouldDecorateChildren]);

  const getTouchEvent = useCallback((e) => {
    if (!e.touches) {
      return null;
    }

    const touch = e.touches[0];
    return { x: touch.clientX, y: touch.clientY };
  }, []);

  const getPassThroughProps = useCallback(() => {
    const ownPropNames = Object.keys(PropTypes);
    return omit(ownPropNames);
  }, []);

  useLayoutEffect(() => {
    if (isEnabled) {
      enable();
    }

    return () => disable();
  }, [isEnabled]);

  useEffect(() => {
    const willBeEnabled = isEnabled;

    if (!willBeEnabled) {
      disable();
    } else {
      enable();
    }
  }, [isEnabled]);

  return (
    <div
      className={className}
      ref={elRef}
      style={objectAssign({}, style, { WebkitUserSelect: 'none' })}
    >
      {decorateChildren(children, objectAssign({}, mapChildProps({ ...detectedEnvironment, ...position }), getPassThroughProps()))}
    </div>
  );
};

ReactCursorPosition.propTypes = {
  activationInteractionMouse: PropTypes.oneOf(Object.values(INTERACTIONS)),
  activationInteractionTouch: PropTypes.oneOf(Object.values(INTERACTIONS)),
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  hoverDelayInMs: PropTypes.number,
  hoverOffDelayInMs: PropTypes.number,
  isEnabled: PropTypes.bool,
  mapChildProps: PropTypes.func,
  onActivationChanged: PropTypes.func,
  onDetectedEnvironmentChanged: PropTypes.func,
  onPositionChanged: PropTypes.func,
  pressDurationInMs: PropTypes.number,
  pressMoveThreshold: PropTypes.number,
  shouldDecorateChildren: PropTypes.bool,
  shouldStopTouchMovePropagation: PropTypes.bool,
  style: PropTypes.object,
  tapDurationInMs: PropTypes.number,
  tapMoveThreshold: PropTypes.number,
};

ReactCursorPosition.defaultProps = {
  activationInteractionMouse: INTERACTIONS.HOVER,
  activationInteractionTouch: INTERACTIONS.TAP,
  className: '',
  hoverDelayInMs: 0,
  hoverOffDelayInMs: 0,
  isEnabled: true,
  mapChildProps: noop,
  onActivationChanged: noop,
  onDetectedEnvironmentChanged: noop,
  onPositionChanged: noop,
  pressDurationInMs: 500,
  pressMoveThreshold: 5,
  shouldDecorateChildren: true,
  shouldStopTouchMovePropagation: false,
  style: {},
  tapDurationInMs: 180,
  tapMoveThreshold: 5,
};

export default ReactCursorPosition;

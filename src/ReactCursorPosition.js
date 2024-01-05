import React, { useState, useRef, useEffect, useCallback, cloneElement } from 'react';
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

    const onTouchStart = useCallback((e) => {
        init();
        onTouchDetected();
        setShouldGuardAgainstMouseEmulationByDevices(true);

        const touchPosition = coreRef.current.getCursorPosition(getTouchEvent(e));
        setPositionState(touchPosition);

        touchActivationRef.current.touchStarted({ e, position: touchPosition });
    }, []);

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
    }, [isActive, shouldStopTouchMovePropagation]);

    const onTouchEnd = useCallback(() => {
        touchActivationRef.current.touchEnded();
        unsetShouldGuardAgainstMouseEmulationByDevices();
    }, []);

    const onTouchCancel = useCallback(() => {
        touchActivationRef.current.touchCanceled();
        unsetShouldGuardAgainstMouseEmulationByDevices();
    }, []);

    const onMouseEnter = useCallback((e) => {
        if (shouldGuardAgainstMouseEmulationByDevices.current) {
            return;
        }

        init();
        onMouseDetected();
        setPositionState(coreRef.current.getCursorPosition(e));
        mouseActivationRef.current.mouseEntered();
    }, []);

    const onMouseMove = useCallback((e) => {
        if (!coreRef.current) {
            return;
        }

        const mousePosition = coreRef.current.getCursorPosition(e);
        setPositionState(mousePosition);
        mouseActivationRef.current.mouseMoved(mousePosition);
    }, []);

    const onMouseLeave = useCallback(() => {
        mouseActivationRef.current.mouseLeft();
        setIsPositionOutside(true);
    }, []);

    const onClick = useCallback((e) => {
        setPositionState(coreRef.current.getCursorPosition(e));
        mouseActivationRef.current.mouseClicked();
        onMouseDetected();
    }, []);

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
    }, [onIsActiveChanged]);

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
    }, [onIsActiveChanged]);

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
    }, [init]);

    const activate = useCallback(() => {
        setIsActive(true);
        onActivationChanged({ isActive: true });
    }, [onActivationChanged]);

    const deactivate = useCallback(() => {
        setIsActive(false, () => {
            const { isPositionOutside, position } = { isPositionOutside, position };

            onPositionChanged({
                isPositionOutside,
                position
            });

            onActivationChanged({ isActive: false });
        });
    }, [onActivationChanged, onPositionChanged]);

    const setPositionState = useCallback((position) => {
        const isOutside = getIsPositionOutside(position);
        setPosition({
            isPositionOutside: isOutside,
            position
        });
        onPositionChanged({ isPositionOutside: isOutside, position });
    }, [onPositionChanged]);

    const setElementDimensionsState = useCallback((dimensions) => {
        setElementDimensions(dimensions);
    }, []);

    const setShouldGuardAgainstMouseEmulationByDevices = useCallback(() => {
        shouldGuardAgainstMouseEmulationByDevices.current = true;
    }, []);

    const unsetShouldGuardAgainstMouseEmulationByDevices = useCallback(() => {
        timers.current.push({
            name: MOUSE_EMULATION_GUARD_TIMER_NAME,
            id: setTimeout(() => {
                shouldGuardAgainstMouseEmulationByDevices.current = false;
            }, 0)
        });
    }, []);

    const getElementDimensions = useCallback((el) => {
        const {
            width,
            height
        } = el.getBoundingClientRect();

        return {
            width,
            height
        };
    }, []);

    const getIsPositionOutside = useCallback((position) => {
        const { x, y } = position;
        const {
            elementDimensions: {
                width,
                height
            }
        } = {
            elementDimensions
        };

        return (
            x < 0 ||
            y < 0 ||
            x > width ||
            y > height
        );
    }, [elementDimensions]);

    const getTouchEvent = useCallback((e) => {
        return e.touches[0];
    }, []);

    const getIsReactComponent = useCallback((reactElement) => {
        return typeof reactElement.type === 'function';
    }, []);

    const shouldDecorateChild = useCallback((child) => {
        return (
            !!child &&
            getIsReactComponent(child) &&
            shouldDecorateChildren
        );
    }, [getIsReactComponent, shouldDecorateChildren]);

    const decorateChild = useCallback((child, props) => {
        return cloneElement(child, props);
    }, []);

    const decorateChildren = useCallback((children, props) => {
        return Children.map(children, (child) => {
            return shouldDecorateChild(child) ? decorateChild(child, props) : child;
        });
    }, [shouldDecorateChild, decorateChild]);

    const addEventListeners = useCallback(() => {
        eventListeners.current.push(
            addEventListener(elRef.current, 'touchstart', onTouchStart, { passive: false }),
            addEventListener(elRef.current, 'touchmove', onTouchMove, { passive: false }),
            addEventListener(elRef.current, 'touchend', onTouchEnd),
            addEventListener(elRef.current, 'touchcancel', onTouchCancel),
            addEventListener(elRef.current, 'mouseenter', onMouseEnter),
            addEventListener(elRef.current, 'mousemove', onMouseMove),
            addEventListener(elRef.current, 'mouseleave', onMouseLeave),
            addEventListener(elRef.current, 'click', onClick)
        );
    }, [onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onMouseEnter, onMouseMove, onMouseLeave, onClick]);

    const removeEventListeners = useCallback(() => {
        while (eventListeners.current.length) {
            eventListeners.current.pop().removeEventListener();
        }
    }, []);

    const getPassThroughProps = useCallback(() => {
        const ownPropNames = Object.keys(PropTypes);
        return omit(ownPropNames);
    }, []);

    useEffect(() => {
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
    // Prop types here
};

ReactCursorPosition.defaultProps = {
    // Default props here
};

export default ReactCursorPosition;

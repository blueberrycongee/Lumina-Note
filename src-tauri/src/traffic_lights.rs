/// Dynamic macOS traffic-light centering.
///
/// Reads the actual button dimensions from the system and positions
/// them centered within the custom title bar area (44 px, matching
/// the CSS `h-11` safe-area).
///
/// Uses a native `NSNotificationCenter` observer for resize events
/// so that repositioning happens synchronously within the same
/// run-loop iteration — preventing the per-frame flicker that occurs
/// with Tauri's `on_window_event` (which fires asynchronously after
/// the system layout pass has already reset button positions).
///
/// During fullscreen transitions, buttons are hidden to avoid fighting
/// with Core Animation's interpolated frames, then repositioned and
/// shown once the transition completes.

/// Height of the custom title bar area in logical points.
/// Must stay in sync with the CSS safe-area class `h-11` (= 44 px).
const TITLEBAR_HEIGHT: f64 = 44.0;

/// Horizontal inset for the first (close) button.
const BUTTON_OFFSET_X: f64 = 14.0;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Runtime;

/// Whether a fullscreen transition animation is in progress.
static IN_FULLSCREEN_TRANSITION: AtomicBool = AtomicBool::new(false);

/// Re-position the three standard window-control buttons so they sit
/// vertically centred inside the custom 44 px title-bar area.
///
/// # Safety
/// Calls into AppKit via `objc2`.  Must be invoked on the main thread
/// (Tauri's `setup` closure and `run_on_main_thread` both guarantee this).
pub fn center_in_titlebar<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    let ns_window_ptr = match window.ns_window() {
        Ok(ptr) => ptr,
        Err(_) => return,
    };

    unsafe {
        reposition_buttons(ns_window_ptr);
    }
}

/// Install a native `NSNotificationCenter` observer that re-centres
/// the traffic-light buttons every time the window resizes.
///
/// Unlike Tauri's `on_window_event`, this fires synchronously within
/// the same run-loop iteration as the native resize, so the buttons
/// are already in the correct position before Core Animation commits
/// the frame — eliminating visible flicker during live resize.
pub fn observe_resize<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    let ns_window_ptr = match window.ns_window() {
        Ok(ptr) => ptr,
        Err(_) => return,
    };

    unsafe {
        // Initial positioning.
        reposition_buttons(ns_window_ptr);

        let center = objc2_foundation::NSNotificationCenter::defaultCenter();
        let ns_window: &objc2_app_kit::NSWindow =
            &*(ns_window_ptr as *const objc2_app_kit::NSWindow);

        // Notifications that should reposition immediately (no animation conflict).
        let reposition_notifications = [
            "NSWindowDidResizeNotification",
            "NSWindowDidDeminiaturizeNotification",
            "NSWindowDidChangeBackingPropertiesNotification",
        ];

        for name in reposition_notifications {
            let captured = ns_window_ptr;
            let block = block2::StackBlock::new(
                move |_notif: std::ptr::NonNull<objc2_foundation::NSNotification>| {
                    if !IN_FULLSCREEN_TRANSITION.load(Ordering::Acquire) {
                        reposition_buttons(captured);
                    }
                },
            );
            let ns_name = objc2_foundation::NSString::from_str(name);
            center.addObserverForName_object_queue_usingBlock(
                Some(&ns_name),
                Some(ns_window),
                None,
                &block,
            );
        }

        // Fullscreen transition start: hide buttons to avoid fighting Core Animation.
        let will_notifications = [
            "NSWindowWillEnterFullScreenNotification",
            "NSWindowWillExitFullScreenNotification",
        ];

        for name in will_notifications {
            let captured = ns_window_ptr;
            let block = block2::StackBlock::new(
                move |_notif: std::ptr::NonNull<objc2_foundation::NSNotification>| {
                    IN_FULLSCREEN_TRANSITION.store(true, Ordering::Release);
                    set_buttons_hidden(captured, true);
                },
            );
            let ns_name = objc2_foundation::NSString::from_str(name);
            center.addObserverForName_object_queue_usingBlock(
                Some(&ns_name),
                Some(ns_window),
                None,
                &block,
            );
        }

        // Fullscreen transition end: reposition and show buttons.
        let did_notifications = [
            "NSWindowDidEnterFullScreenNotification",
            "NSWindowDidExitFullScreenNotification",
        ];

        for name in did_notifications {
            let captured = ns_window_ptr;
            let block = block2::StackBlock::new(
                move |_notif: std::ptr::NonNull<objc2_foundation::NSNotification>| {
                    IN_FULLSCREEN_TRANSITION.store(false, Ordering::Release);
                    reposition_buttons(captured);
                    set_buttons_hidden(captured, false);
                },
            );
            let ns_name = objc2_foundation::NSString::from_str(name);
            center.addObserverForName_object_queue_usingBlock(
                Some(&ns_name),
                Some(ns_window),
                None,
                &block,
            );
        }
    }
}

/// Hide or show the three traffic-light buttons.
unsafe fn set_buttons_hidden(ns_window_ptr: *mut std::ffi::c_void, hidden: bool) {
    use objc2_app_kit::{NSWindow, NSWindowButton};

    let ns_window: &NSWindow = &*(ns_window_ptr as *const NSWindow);

    if let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) {
        close.setHidden(hidden);
    }
    if let Some(minimize) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) {
        minimize.setHidden(hidden);
    }
    if let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) {
        zoom.setHidden(hidden);
    }
}

/// Core repositioning logic operating on a raw `ns_window` pointer.
///
/// # Safety
/// `ns_window_ptr` must be a valid pointer to an `NSWindow`.
unsafe fn reposition_buttons(ns_window_ptr: *mut std::ffi::c_void) {
    use objc2_app_kit::{NSWindow, NSWindowButton};
    use objc2_foundation::NSPoint;

    let ns_window: &NSWindow = &*(ns_window_ptr as *const NSWindow);

    // Obtain the three traffic-light buttons.
    let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(minimize) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) else {
        return;
    };

    // The title-bar container is two levels up from the button.
    let Some(superview) = close.superview() else {
        return;
    };
    let Some(title_bar_container) = superview.superview() else {
        return;
    };

    // Read the actual button height from the system.
    let button_height = close.frame().size.height;

    // Resize the title-bar container to our custom height and pin it
    // to the top of the window (macOS coordinates: origin at bottom-left).
    let mut container_frame = title_bar_container.frame();
    container_frame.size.height = TITLEBAR_HEIGHT;
    container_frame.origin.y = ns_window.frame().size.height - TITLEBAR_HEIGHT;
    title_bar_container.setFrame(container_frame);

    // Vertically centre the buttons inside the container.
    let centred_y = (TITLEBAR_HEIGHT - button_height) / 2.0;

    // Preserve the native inter-button spacing.
    let space_between = minimize.frame().origin.x - close.frame().origin.x;

    for (i, button) in [&*close, &*minimize, &*zoom].iter().enumerate() {
        let origin = NSPoint::new(BUTTON_OFFSET_X + (i as f64 * space_between), centred_y);
        button.setFrameOrigin(origin);
    }
}

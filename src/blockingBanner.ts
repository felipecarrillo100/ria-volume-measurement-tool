export interface BlockingBannerOptions {
    /** Message to display in the banner */
    text?: string;
    /** Text for the abort button; omit to hide the button */
    buttonText?: string;
    /** Callback fired when the abort button is clicked */
    onAbort?: () => void;
    /** Optional background color or overlay styling */
    backgroundColor?: string;
    /** Optional text color */
    textColor?: string;
    /** Start with initial progress (0–100) */
    progress?: number;
}

/**
 * Creates a blocking overlay banner at the top of the <body>,
 * preventing user interaction until removed or aborted.
 */
export function showBlockingBanner(options: BlockingBannerOptions = {}): void {
    // Prevent duplicates
    if (document.getElementById("blocking-banner-overlay")) return;

    const {
        text = "Processing, please wait...",
        buttonText = "Abort",
        onAbort,
        backgroundColor = "rgba(0, 0, 0, 0.6)",
        textColor = "#ffffff",
        progress = undefined,
    } = options;

    const overlay = document.createElement("div");
    overlay.id = "blocking-banner-overlay";
    Object.assign(overlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        zIndex: "999999",
        backgroundColor,
        color: textColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        backdropFilter: "blur(4px)",
        userSelect: "none",
        pointerEvents: "none", // block everything except the content area
    });

    // Content (clickable)
    const content = document.createElement("div");
    Object.assign(content.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.5rem",
        pointerEvents: "auto",
        textAlign: "center",
    });

    // Message
    const message = document.createElement("div");
    message.textContent = text;
    Object.assign(message.style, {
        marginBottom: buttonText ? "1rem" : "0",
    });

    content.appendChild(message);

    // Progress value (new)
    const progressValue = document.createElement("div");
    progressValue.id = "blocking-banner-progress";
    progressValue.textContent = progress !== undefined ? `${Math.round(progress)}%` : "";
    Object.assign(progressValue.style, {
        fontSize: "1.5rem",
        marginBottom: buttonText ? "1rem" : "0",
        minHeight: "1.5em",
    });
    content.appendChild(progressValue);

    // Optional Abort button
    if (buttonText) {
        const button = document.createElement("button");
        button.textContent = buttonText;
        button.classList.add("btn", "btn-danger", "btn-sm", "w-25");
        button.addEventListener("click", e => {
            e.stopPropagation();
            if (onAbort) onAbort();
            hideBlockingBanner();
        });
        content.appendChild(button);
    }

    overlay.appendChild(content);
    document.body.insertBefore(overlay, document.body.firstChild);
    document.body.style.overflow = "hidden"; // disable scrolling
}

/**
 * Removes the blocking banner overlay if it exists.
 */
export function hideBlockingBanner(): void {
    const overlay = document.getElementById("blocking-banner-overlay");
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }
    document.body.style.overflow = "";
}

/**
 * Updates the numeric progress value (0–100).
 */
export function updateBlockingBannerProgress(value: number): void {
    const el = document.getElementById("blocking-banner-progress");
    if (el) el.textContent = `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

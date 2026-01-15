/**
 * ErrorHandler - Centralized error handling and user-friendly error messages
 *
 * Usage:
 *   import { ErrorHandler } from './error-handler.js';
 *   ErrorHandler.showError('Failed to load city data', error);
 */

export class ErrorHandler {
    /**
     * Error categories with user-friendly messages
     */
    static ERROR_TYPES = {
        NETWORK: {
            title: 'Connection Error',
            icon: '🌐',
            defaultMessage: 'Unable to connect to the server. Please check your internet connection.',
            suggestions: [
                'Check your internet connection',
                'Try refreshing the page',
                'Wait a moment and try again',
            ],
        },
        DATA_LOADING: {
            title: 'Data Loading Error',
            icon: '📦',
            defaultMessage: 'Failed to load required data.',
            suggestions: [
                'Try selecting a different city',
                'Refresh the page to reload data',
                'Check if the city data file exists',
            ],
        },
        API: {
            title: 'API Error',
            icon: '🔌',
            defaultMessage: 'External service unavailable.',
            suggestions: [
                'The geocoding service may be temporarily unavailable',
                'Try using the map click instead of address search',
                'Wait a few minutes and try again',
            ],
        },
        CALCULATION: {
            title: 'Calculation Error',
            icon: '🔢',
            defaultMessage: 'An error occurred during route calculation.',
            suggestions: [
                'Try a different origin point',
                'Reduce the travel time limit',
                'Lower the quality setting',
            ],
        },
        EXPORT: {
            title: 'Export Error',
            icon: '💾',
            defaultMessage: 'Failed to export the map.',
            suggestions: [
                'Check if your browser allows downloads',
                'Try a different browser',
                'Ensure you have enough disk space',
            ],
        },
        CONFIG: {
            title: 'Configuration Error',
            icon: '⚙️',
            defaultMessage: 'Missing or invalid configuration.',
            suggestions: [
                'Copy config.template.js to config.js',
                'Add your LocationIQ API key',
                'See README.md for setup instructions',
            ],
        },
        UNKNOWN: {
            title: 'Unexpected Error',
            icon: '❌',
            defaultMessage: 'An unexpected error occurred.',
            suggestions: [
                'Try refreshing the page',
                'Clear your browser cache',
                'Report this issue on GitHub if it persists',
            ],
        },
    };

    /**
     * Show an error notification to the user
     * @param {string} message - Custom error message
     * @param {Error} error - Error object (optional)
     * @param {string} type - Error type from ERROR_TYPES (optional)
     * @param {number} duration - Duration in ms (0 = persistent)
     */
    static showError(message, error = null, type = 'UNKNOWN', duration = 8000) {
        const errorType = this.ERROR_TYPES[type] || this.ERROR_TYPES.UNKNOWN;

        console.error(`[${errorType.title}]`, message, error);

        // Create error notification
        const notification = this.createNotification(message, errorType, error);

        // Add to DOM
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => notification.classList.add('show'), 10);

        // Auto-dismiss if duration > 0
        if (duration > 0) {
            setTimeout(() => this.dismissNotification(notification), duration);
        }

        return notification;
    }

    /**
     * Create notification DOM element
     */
    static createNotification(message, errorType, error) {
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.setAttribute('role', 'alert');
        notification.setAttribute('aria-live', 'assertive');

        const detailsId = `error-details-${Date.now()}`;
        const showDetails = error !== null;

        notification.innerHTML = `
            <div class="error-header">
                <span class="error-icon">${errorType.icon}</span>
                <div class="error-content">
                    <div class="error-title">${errorType.title}</div>
                    <div class="error-message">${message}</div>
                </div>
                <button class="error-close" aria-label="Dismiss error">
                    ×
                </button>
            </div>
            ${showDetails ? `
                <button class="error-details-toggle" aria-expanded="false" aria-controls="${detailsId}">
                    Show details
                </button>
                <div class="error-details" id="${detailsId}" hidden>
                    <pre>${error.stack || error.message || error}</pre>
                </div>
            ` : ''}
            ${errorType.suggestions.length > 0 ? `
                <div class="error-suggestions">
                    <div class="suggestions-title">Try this:</div>
                    <ul>
                        ${errorType.suggestions.map(s => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        `;

        // Add event listeners
        const closeBtn = notification.querySelector('.error-close');
        closeBtn.addEventListener('click', () => this.dismissNotification(notification));

        if (showDetails) {
            const detailsToggle = notification.querySelector('.error-details-toggle');
            const detailsDiv = notification.querySelector('.error-details');

            detailsToggle.addEventListener('click', () => {
                const isExpanded = detailsToggle.getAttribute('aria-expanded') === 'true';
                detailsToggle.setAttribute('aria-expanded', !isExpanded);
                detailsDiv.hidden = isExpanded;
                detailsToggle.textContent = isExpanded ? 'Show details' : 'Hide details';
            });
        }

        // Inject styles if not already present
        this.injectStyles();

        return notification;
    }

    /**
     * Dismiss a notification
     */
    static dismissNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    /**
     * Dismiss all error notifications
     */
    static dismissAll() {
        const notifications = document.querySelectorAll('.error-notification');
        notifications.forEach(n => this.dismissNotification(n));
    }

    /**
     * Inject error notification styles
     */
    static injectStyles() {
        if (document.getElementById('error-handler-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'error-handler-styles';
        style.textContent = `
            .error-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                max-width: 400px;
                background: white;
                border-left: 4px solid #ef4444;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                padding: 16px;
                z-index: 10000;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
            }

            .error-notification.show {
                opacity: 1;
                transform: translateX(0);
            }

            [data-theme="dark"] .error-notification {
                background: #1e293b;
                color: #f1f5f9;
            }

            .error-header {
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }

            .error-icon {
                font-size: 24px;
                flex-shrink: 0;
            }

            .error-content {
                flex: 1;
            }

            .error-title {
                font-weight: 600;
                font-size: 16px;
                color: #1f2937;
                margin-bottom: 4px;
            }

            [data-theme="dark"] .error-title {
                color: #f1f5f9;
            }

            .error-message {
                font-size: 14px;
                color: #6b7280;
                line-height: 1.4;
            }

            [data-theme="dark"] .error-message {
                color: #94a3b8;
            }

            .error-close {
                background: none;
                border: none;
                font-size: 24px;
                color: #9ca3af;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                line-height: 1;
                flex-shrink: 0;
            }

            .error-close:hover {
                color: #ef4444;
            }

            .error-details-toggle {
                margin-top: 12px;
                background: none;
                border: none;
                color: #2563eb;
                font-size: 13px;
                cursor: pointer;
                padding: 0;
                text-decoration: underline;
            }

            [data-theme="dark"] .error-details-toggle {
                color: #60a5fa;
            }

            .error-details {
                margin-top: 8px;
                padding: 8px;
                background: #f3f4f6;
                border-radius: 4px;
                font-size: 11px;
                overflow-x: auto;
                max-height: 150px;
            }

            [data-theme="dark"] .error-details {
                background: #0f172a;
            }

            .error-details pre {
                margin: 0;
                font-family: 'Courier New', monospace;
                color: #374151;
                white-space: pre-wrap;
                word-break: break-word;
            }

            [data-theme="dark"] .error-details pre {
                color: #cbd5e1;
            }

            .error-suggestions {
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid #e5e7eb;
            }

            [data-theme="dark"] .error-suggestions {
                border-top-color: #334155;
            }

            .suggestions-title {
                font-size: 13px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 8px;
            }

            [data-theme="dark"] .suggestions-title {
                color: #e2e8f0;
            }

            .error-suggestions ul {
                margin: 0;
                padding-left: 20px;
                font-size: 13px;
                color: #6b7280;
            }

            [data-theme="dark"] .error-suggestions ul {
                color: #94a3b8;
            }

            .error-suggestions li {
                margin-bottom: 4px;
            }

            @media (max-width: 640px) {
                .error-notification {
                    top: 10px;
                    right: 10px;
                    left: 10px;
                    max-width: none;
                }
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Wrap an async function with error handling
     * @param {Function} fn - Async function to wrap
     * @param {string} errorMessage - Error message to display
     * @param {string} errorType - Error type
     */
    static async wrapAsync(fn, errorMessage, errorType = 'UNKNOWN') {
        try {
            return await fn();
        } catch (error) {
            this.showError(errorMessage, error, errorType);
            throw error; // Re-throw for caller to handle if needed
        }
    }

    /**
     * Wrap a function with error handling
     */
    static wrap(fn, errorMessage, errorType = 'UNKNOWN') {
        try {
            return fn();
        } catch (error) {
            this.showError(errorMessage, error, errorType);
            throw error;
        }
    }
}

// Export singleton instance
export default ErrorHandler;

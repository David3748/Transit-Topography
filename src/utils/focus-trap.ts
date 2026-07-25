/**
 * Minimal focus trap for modal dialogs: keeps Tab navigation inside the
 * container while active and restores focus to the previously focused
 * element on deactivate.
 */

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

export class FocusTrap {
    private previouslyFocused: Element | null = null;
    private readonly onKeydown = (e: KeyboardEvent) => this.handleKeydown(e);

    constructor(private readonly container: HTMLElement) {}

    activate(): void {
        this.previouslyFocused = document.activeElement;
        this.container.addEventListener('keydown', this.onKeydown);
        const first = this.focusableElements()[0];
        (first ?? this.container).focus();
    }

    deactivate(): void {
        this.container.removeEventListener('keydown', this.onKeydown);
        if (this.previouslyFocused instanceof HTMLElement) {
            this.previouslyFocused.focus();
        }
        this.previouslyFocused = null;
    }

    private focusableElements(): HTMLElement[] {
        return Array.from(this.container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            el => el.offsetParent !== null || el === document.activeElement
        );
    }

    private handleKeydown(e: KeyboardEvent): void {
        if (e.key !== 'Tab') return;

        const focusable = this.focusableElements();
        if (focusable.length === 0) {
            e.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || !this.container.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !this.container.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    }
}

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { FocusTrap } from '../../src/utils/focus-trap';

function buildModal(): {
    modal: HTMLElement;
    first: HTMLButtonElement;
    last: HTMLButtonElement;
    outside: HTMLButtonElement;
} {
    document.body.innerHTML = `
        <button id="outside">Outside</button>
        <div id="modal">
            <button id="first">First</button>
            <input id="middle" type="text" />
            <button id="last">Last</button>
        </div>`;
    return {
        modal: document.getElementById('modal')!,
        first: document.getElementById('first') as HTMLButtonElement,
        last: document.getElementById('last') as HTMLButtonElement,
        outside: document.getElementById('outside') as HTMLButtonElement,
    };
}

function tabKey(shift = false): KeyboardEvent {
    return new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
    });
}

describe('FocusTrap', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('moves focus into the container on activate', () => {
        const { modal, first, outside } = buildModal();
        outside.focus();
        const trap = new FocusTrap(modal);
        trap.activate();
        expect(document.activeElement).toBe(first);
    });

    it('wraps Tab from the last element back to the first', () => {
        const { modal, first, last } = buildModal();
        const trap = new FocusTrap(modal);
        trap.activate();
        last.focus();
        modal.dispatchEvent(tabKey());
        expect(document.activeElement).toBe(first);
    });

    it('wraps Shift+Tab from the first element to the last', () => {
        const { modal, first, last } = buildModal();
        const trap = new FocusTrap(modal);
        trap.activate();
        first.focus();
        modal.dispatchEvent(tabKey(true));
        expect(document.activeElement).toBe(last);
    });

    it('ignores non-Tab keys', () => {
        const { modal, first } = buildModal();
        const trap = new FocusTrap(modal);
        trap.activate();
        first.focus();
        modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        expect(document.activeElement).toBe(first);
    });

    it('restores the previously focused element on deactivate', () => {
        const { modal, outside } = buildModal();
        outside.focus();
        const trap = new FocusTrap(modal);
        trap.activate();
        trap.deactivate();
        expect(document.activeElement).toBe(outside);
    });
});

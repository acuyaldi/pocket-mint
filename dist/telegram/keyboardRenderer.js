"use strict";
// ============================================================
// Maps the provider-neutral InteractionKeyboard into Telegram's inline
// keyboard JSON. Button labels come from the safe user-facing option labels
// already exposed by the application projection; callback_data is always
// just the opaque token — never a domain identifier or value.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderInlineKeyboard = renderInlineKeyboard;
/** Telegram enforces a 64-byte callback_data limit and a 1-64 char button text limit. */
const MAX_BUTTON_TEXT = 64;
function renderInlineKeyboard(keyboard) {
    return {
        inline_keyboard: keyboard.rows.map((row) => row.map((button) => ({
            text: (button.discriminator ? `${button.label} (${button.discriminator})` : button.label).slice(0, MAX_BUTTON_TEXT),
            callback_data: button.token,
        }))),
    };
}
//# sourceMappingURL=keyboardRenderer.js.map
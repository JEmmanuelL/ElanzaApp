// DOM extraction and manipulation utilities

export const select = (selector) => document.querySelector(selector);
export const selectAll = (selector) => document.querySelectorAll(selector);

export const on = (element, event, handler) => {
    if (element) {
        element.addEventListener(event, handler);
    }
};

export const createElement = (tag, className = '', textContent = '') => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
};


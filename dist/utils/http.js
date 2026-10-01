"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.asyncHandler = asyncHandler;
/** Standard success envelope. */
function ok(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
}
/** Wraps an async route handler so thrown errors reach the error middleware. */
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
//# sourceMappingURL=http.js.map
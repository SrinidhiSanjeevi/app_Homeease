/**
 * HomeEase Admin Pagination Utility
 *
 * Provides safe, bounded pagination parsing and metadata formatting for admin list queries.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Parses and bounds `page` and `limit` from request query params.
 * Enforces `MAX_LIMIT` to prevent unbounded in-memory collection scans.
 *
 * @param {Object} query - req.query object
 * @returns {{ page: number, limit: number, skip: number, maxLimit: number }}
 */
function parsePagination(query = {}) {
  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) {
    page = DEFAULT_PAGE;
  }

  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  } else if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    maxLimit: MAX_LIMIT
  };
}

/**
 * Formats standardized pagination metadata.
 *
 * @param {{ page: number, limit: number, total: number }} params
 * @returns {{ page: number, limit: number, total: number, totalPages: number }}
 */
function formatPaginationResult({ page, limit, total }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages
  };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePagination,
  formatPaginationResult
};

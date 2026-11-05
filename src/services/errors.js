// A refusal the user should see. `status` is the HTTP status the API answers with;
// the MCP server will turn the same error into a tool error.
class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { ServiceError };

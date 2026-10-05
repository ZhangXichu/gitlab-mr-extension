// Thrown when a site answers "not logged in". The popup shows a button that opens `loginUrl`,
// where the user signs in the normal way (for example with their company Google account).
export class LoginNeededError extends Error {
  constructor(message, loginUrl) {
    super(message);
    this.name = "LoginNeededError";
    this.loginUrl = loginUrl;
  }
}

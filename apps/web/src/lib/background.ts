import { after } from "next/server";

// Lets a fire-and-forget task (such as an email send) outlive the response.
// `after` keeps the work alive after the response on a Node server and on
// serverless hosts that provide waitUntil. It only works inside a request
// (Server Action or Route Handler); anywhere else it throws, and the task
// simply runs unattached, which is the plain `void promise` behavior.
export function runInBackground(task: Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task;
  }
}

import { defineBugCase } from "../../framework/types";

// T6285: before a file is uploaded the client asks for a place to put it and is
// handed a one-time address. Where on disk that address lands is the one
// decision that keeps an upload inside the area meant for uploads - and the
// request carried a field naming the file, which was used as the address. A
// name with .. in it walks out of that area, and the file then lands wherever
// the name says.
export default defineBugCase({
  id: "attachment/y892-where-an-upload-lands",
  title: "Where an upload lands is the server's decision",
  runner: "upload-path-from-the-client",
  timeoutMs: 180_000,
  bug: {
    issue: "T6285",
    status: "fixed",
    sourceCommits: ["22c343454"],
  },
  config: {
    traversalPrefix: "../../escaped-",
    // UploadType.Table
    uploadType: 1,
    contentLength: 12,
  },
});

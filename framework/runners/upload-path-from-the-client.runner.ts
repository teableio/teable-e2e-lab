import { axios } from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UploadPathFromTheClientCaseConfig } from "../types";

// Ask for somewhere to put a file, and say where -> checkpoint: the answer is
// somewhere the server chose.
//
// Before a file is uploaded the client asks for a place to put it and is handed
// a one-time address. Where on disk that address lands is the server's business:
// it is the one decision that keeps an upload inside the area meant for uploads.
//
// The request carried a field naming the file, and that name was used as the
// address. A name with .. in it walks out of the upload area, and the file then
// lands wherever the name says - which is how an upload becomes a way to write
// over things that are not uploads.
//
// The case only asks for the address. It does not upload anything: on the side
// where the name is honoured, uploading would put a file where the name points,
// and a regression test should not be the thing that does that. The address
// alone says which side answered.

const SIGNATURE_URL = "/attachments/signature";

export const runUploadPathFromTheClientCase = async (
  bugCase: BugCaseFor<"upload-path-from-the-client">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UploadPathFromTheClientCaseConfig = bugCase.config;
  const namedPlace = `${config.traversalPrefix}${context.runId}`;

  if (!namedPlace.includes("..")) {
    throw new Error(
      "the name the case sends has to climb out of the upload area, or an address that honoured it would look fine",
    );
  }

  const probe = await bugCheckpoint(
    "where-an-upload-lands-is-the-servers-decision",
    async () => {
      const response = await axios.post(
        SIGNATURE_URL,
        {
          type: config.uploadType,
          baseId: globalThis.testConfig.baseId,
          contentType: "text/plain",
          contentLength: config.contentLength,
          // The field the client used to name the file. It is gone from the
          // request shape now, and a request carrying it should simply be
          // answered with an address of the server's own choosing.
          hash: namedPlace,
        },
        { validateStatus: () => true },
      );
      const routing = pickRoutingHeaders(response.headers);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `asking where to put a file answered ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }
      const place = response.data as {
        path?: string;
        token?: string;
        url?: string;
      };
      const address = `${place.path ?? ""} ${place.token ?? ""} ${place.url ?? ""}`;
      if (address.includes(namedPlace)) {
        throw new Error(
          `the address came back as ${JSON.stringify(place.path ?? place.url ?? place.token)} - it is the name the ` +
            "client sent, so a client decides where its upload lands and can name somewhere outside the upload area",
        );
      }
      if (address.includes("..")) {
        throw new Error(
          `the address came back as ${JSON.stringify(place.path ?? place.url)}, which climbs out of the directory ` +
            "it is meant to stay in",
        );
      }
      if (!place.token) {
        throw new Error(
          `the answer carries no address at all: ${JSON.stringify(place)}`,
        );
      }
      return { routing, token: place.token, path: place.path ?? null };
    },
  );

  return {
    details: {
      sentName: namedPlace,
      token: probe.token,
      path: probe.path,
      routing: probe.routing,
    },
  };
};

import { axios, urlBuilder } from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { PluginSecretInListCaseConfig } from "../types";

// Register a plugin -> ask for the list of one's plugins -> checkpoint: the
// list does not carry the plugin's secret.
//
// A plugin's secret is what proves a request comes from that plugin. It is
// shown once, when the plugin is registered, and after that the product holds
// only a scrambled copy - the point of scrambling it being that the stored form
// is not usable and not worth stealing.
//
// The list handed that scrambled copy back on every read. It is not the secret
// itself, which is why this is easy to wave away, and it is also the one thing a
// stored credential must never be: reachable through an ordinary read, offline,
// by anybody who can see the page - including anything embedded in it.
//
// The case asserts what the list carries for a plugin it just registered: no
// scrambled copy, and never the real secret either. The registration response is
// allowed to carry the real one - that is the single moment it is meant to be
// shown - so it is read outside the checkpoint and kept, to be sure the list is
// not showing that instead.

const CREATE_PLUGIN = "/plugin";
const GET_PLUGINS = "/plugin";
const DELETE_PLUGIN = "/plugin/{pluginId}";

interface PluginSummary {
  id: string;
  name: string;
  secret?: string;
}

export const runPluginSecretInListCase = async (
  bugCase: BugCaseFor<"plugin-secret-in-list">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: PluginSecretInListCaseConfig = bugCase.config;
  const pluginName = `${config.namePrefix}-${context.runId}`.slice(0, 20);
  let pluginId = "";

  try {
    const created = await axios.post<PluginSummary>(
      CREATE_PLUGIN,
      {
        name: pluginName,
        logo: config.logo,
        positions: config.positions,
      },
      { validateStatus: () => true },
    );
    if (created.status < 200 || created.status >= 300 || !created.data?.id) {
      throw new Error(
        `registering a plugin answered ${created.status}: ${JSON.stringify(created.data)}`,
      );
    }
    pluginId = created.data.id;
    const secretShownOnce = created.data.secret ?? "";

    // Fixture verification, outside the checkpoint: registering really does
    // hand over a secret once. Without that there is no credential in play and
    // the list would have nothing to leak.
    if (!secretShownOnce) {
      throw new Error(
        `registering the plugin returned no secret at all (${JSON.stringify(created.data)}) - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "the-list-of-plugins-carries-no-secret",
      async () => {
        const listed = await axios.get<PluginSummary[]>(GET_PLUGINS, {
          validateStatus: () => true,
        });
        if (listed.status !== 200) {
          throw new Error(
            `listing plugins answered ${listed.status}: ${JSON.stringify(listed.data)}`,
          );
        }
        const routing = pickRoutingHeaders(listed.headers);
        const mine = listed.data.find((plugin) => plugin.id === pluginId);
        if (!mine) {
          throw new Error(
            `the plugin just registered is not in the list of ${listed.data.length} - the case is watching the ` +
              "wrong list",
          );
        }
        const carried = mine.secret;
        if (carried === undefined || carried === null || carried === "") {
          return { routing, carried: null as string | null };
        }
        if (carried === secretShownOnce) {
          throw new Error(
            "the list hands back the plugin's real secret, which is only meant to be shown once at registration",
          );
        }
        // A scrambled copy is recognisable: it is what the product stores, and
        // it is what must not travel. A masked one - mostly asterisks - is the
        // repaired shape and is allowed.
        if (!carried.includes("*")) {
          throw new Error(
            `the list carries ${JSON.stringify(carried.slice(0, 12))}... for this plugin - a stored credential ` +
              "reachable through an ordinary read, by anybody who can see the page",
          );
        }
        return { routing, carried };
      },
    );

    return {
      details: {
        pluginId,
        secretInList: probe.carried,
        routing: probe.routing,
      },
    };
  } finally {
    if (pluginId) {
      try {
        await axios.delete(urlBuilder(DELETE_PLUGIN, { pluginId }), {
          validateStatus: () => true,
        });
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (plugin ${pluginId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};

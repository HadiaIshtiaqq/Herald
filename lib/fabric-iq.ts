// ─── fabric-iq.ts — semantic ontology layer (Fabric IQ pattern) ───────────────
// Microsoft describes Fabric IQ as "data, meaning, and actions in a single
// semantic layer, with Ontology at the core" — entities and relationships that
// let agents reason over real business concepts instead of raw rows.
//
// Herald's implementation: a deterministic ontology connecting
//   ServiceArea ──demands──▶ Skill ◀──teaches── Certification ◀──requires── Role
// loaded from data/fabric-ontology.json and merged with the live
// data/area-cert-requirements.json so the graph always reflects current config.
//
// Every query answer carries a `path` — the chain of relations that produced
// it — so downstream agents return *explainable*, cited reasoning, not vibes.

import fs from "fs";
import path from "path";

// ── Ontology types ────────────────────────────────────────────────────────────

export interface OntologyCert { id: string; title: string; teaches: string[]; hours?: number; level?: string; }
export interface OntologyRole { id: string; title: string; requires: string[]; }
export interface OntologyArea {
  id: string;
  title?: string;
  demands: string[];
  required_certs: string[];
  criticality?: "low" | "medium" | "high";
  /** Areas this area consumes — consumers of a changed area are in its blast radius. */
  depends_on?: string[];
  /** What observably breaks when this area fails (drives the failure replay). */
  failure_mode?: string;
}

export interface Ontology {
  version: string;
  certifications: OntologyCert[];
  roles: OntologyRole[];
  areas: OntologyArea[];
}

export interface SemanticAnswer<T> {
  value: T;
  /** Human-readable relation chain, e.g. "area:auth-service ─demands→ skill:Identity ─taught-by→ cert:SC-300" */
  path: string[];
  grounded_in: "fabric-ontology" | "area-cert-requirements" | "merged";
}

export interface BlastHop {
  area: string;
  title: string;
  criticality: "low" | "medium" | "high";
  distance: number;            // hops from the changed area (0 = the change itself)
  severity: number;            // 0–100, criticality decayed by distance
  via: string;                 // dependency path that pulled this area in
  failure_mode: string;
}

export interface CascadeStep {
  t: string;                   // simulated timeline marker, e.g. "T+0s"
  area: string;
  event: string;
  integrity_after: number;     // 0–100 running "damage meter"
}

export interface BlastRadiusReport {
  origin_areas: string[];
  total_areas_affected: number;
  blast_score: number;         // 0–100 aggregate
  hops: BlastHop[];
  /** Deterministic failure replay — worst-case propagation, ordered by hop distance. */
  cascade: CascadeStep[];
  grounded_in: "fabric-ontology";
}

export interface SkillGap {
  member: string;
  area: string;
  missing_certs: string[];
  missing_skills: string[];
  covered_skills: string[];
  readiness: number; // 0–100, skill-coverage weighted
  explanation: string[];
}

// ── Loading + merging ─────────────────────────────────────────────────────────

const EMPTY: Ontology = { version: "0", certifications: [], roles: [], areas: [] };

export function loadOntology(dataDir: string): Ontology {
  let onto: Ontology = EMPTY;
  try {
    onto = JSON.parse(fs.readFileSync(path.join(dataDir, "fabric-ontology.json"), "utf-8")) as Ontology;
  } catch {
    console.warn("[FabricIQ] data/fabric-ontology.json missing — semantic layer runs on live requirements only.");
    onto = { ...EMPTY, version: "live-only" };
  }

  // Merge live area→cert requirements so the ontology never drifts from config.
  // Accepts the shapes seen in the wild: { area: ["AZ-204"] },
  // { area: { certs: [...] } }, and Herald's { area: { required: [...] } }.
  try {
    const reqRaw = JSON.parse(fs.readFileSync(path.join(dataDir, "area-cert-requirements.json"), "utf-8")) as {
      requirements?: Record<string, unknown>;
    };
    for (const [areaId, val] of Object.entries(reqRaw.requirements ?? {})) {
      const obj = val as { certs?: string[]; required?: string[] };
      const certs = Array.isArray(val)
        ? (val as string[])
        : Array.isArray(obj?.required)
          ? obj.required
          : Array.isArray(obj?.certs)
            ? obj.certs
            : [];
      if (certs.length === 0) continue;
      const existing = onto.areas.find(a => a.id === areaId);
      if (existing) {
        existing.required_certs = [...new Set([...existing.required_certs, ...certs])];
      } else {
        onto.areas.push({ id: areaId, demands: [], required_certs: certs });
      }
    }
  } catch { /* live requirements optional — ontology stands alone */ }

  return onto;
}

// ── Semantic queries ──────────────────────────────────────────────────────────

export class FabricIQ {
  constructor(private onto: Ontology) {}

  get ontology(): Ontology { return this.onto; }

  cert(id: string): OntologyCert | undefined {
    return this.onto.certifications.find(c => c.id.toLowerCase() === id.toLowerCase());
  }

  area(id: string): OntologyArea | undefined {
    return this.onto.areas.find(a => a.id.toLowerCase() === id.toLowerCase());
  }

  /** Which certifications cover a changed service area — with the relation path. */
  certsForArea(areaId: string): SemanticAnswer<OntologyCert[]> {
    const area = this.area(areaId);
    if (!area) return { value: [], path: [`area:${areaId} (unknown — no ontology entry)`], grounded_in: "fabric-ontology" };

    const direct = area.required_certs
      .map(id => this.cert(id) ?? { id, title: id, teaches: [] });
    const viaSkills = this.onto.certifications.filter(
      c => c.teaches.some(s => area.demands.includes(s)) && !direct.some(d => d.id === c.id)
    );

    const pathLines = [
      ...direct.map(c => `area:${area.id} ─requires→ cert:${c.id}`),
      ...viaSkills.flatMap(c =>
        c.teaches.filter(s => area.demands.includes(s))
          .map(s => `area:${area.id} ─demands→ skill:${s} ─taught-by→ cert:${c.id}`))
    ];
    return { value: [...direct, ...viaSkills], path: pathLines, grounded_in: "merged" };
  }

  /** Skills a member is missing for an area, given the certs they hold. */
  skillGapForMember(memberName: string, heldCerts: string[], areaId: string): SkillGap {
    const area = this.area(areaId);
    const held = new Set(heldCerts.map(c => c.toUpperCase()));
    const demanded = area?.demands ?? [];

    const taught = new Set<string>();
    for (const certId of held) {
      const c = this.cert(certId);
      c?.teaches.forEach(s => taught.add(s));
    }

    const covered = demanded.filter(s => taught.has(s));
    const missingSkills = demanded.filter(s => !taught.has(s));
    const missingCerts = (area?.required_certs ?? []).filter(c => !held.has(c.toUpperCase()));

    const certScore = area && area.required_certs.length > 0
      ? (area.required_certs.length - missingCerts.length) / area.required_certs.length
      : 1;
    const skillScore = demanded.length > 0 ? covered.length / demanded.length : 1;
    const readiness = Math.round((0.6 * certScore + 0.4 * skillScore) * 100);

    const explanation = [
      `Ontology v${this.onto.version}: area:${areaId} requires [${(area?.required_certs ?? []).join(", ") || "none"}] and demands skills [${demanded.join(", ") || "none"}].`,
      `${memberName} holds [${heldCerts.join(", ") || "no certs"}], which teach [${[...taught].join(", ") || "no mapped skills"}].`,
      missingCerts.length
        ? `Missing certs: ${missingCerts.join(", ")} → drives ${Math.round(60 * (missingCerts.length / Math.max(area?.required_certs.length ?? 1, 1)))}pt readiness penalty.`
        : "All required certifications held.",
      missingSkills.length ? `Uncovered skills: ${missingSkills.join(", ")}.` : "All demanded skills covered."
    ];

    return { member: memberName, area: areaId, missing_certs: missingCerts, missing_skills: missingSkills, covered_skills: covered, readiness, explanation };
  }

  /**
   * Blast radius: which areas are transitively affected when the given areas
   * change, and the deterministic worst-case failure replay. Consumers break
   * when their dependency breaks, so we walk depends_on edges in reverse.
   */
  blastRadius(originAreaIds: string[]): BlastRadiusReport {
    const critWeight = { high: 100, medium: 60, low: 20 } as const;
    const origins = originAreaIds
      .map(id => this.area(id))
      .filter((a): a is OntologyArea => !!a);

    // Reverse adjacency: who depends on X
    const consumersOf = new Map<string, string[]>();
    for (const a of this.onto.areas) {
      for (const dep of a.depends_on ?? []) {
        consumersOf.set(dep, [...(consumersOf.get(dep) ?? []), a.id]);
      }
    }

    // BFS outward from the changed areas
    const best = new Map<string, BlastHop>();
    const queue: Array<{ id: string; distance: number; via: string }> = origins.map(a => ({
      id: a.id, distance: 0, via: `${a.id} (changed)`
    }));
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const area = this.area(cur.id);
      if (!area) continue;
      const existing = best.get(cur.id);
      if (existing && existing.distance <= cur.distance) continue;
      const crit = area.criticality ?? "medium";
      best.set(cur.id, {
        area: area.id,
        title: area.title ?? area.id,
        criticality: crit,
        distance: cur.distance,
        severity: Math.max(5, Math.round(critWeight[crit] * Math.pow(0.6, cur.distance))),
        via: cur.via,
        failure_mode: area.failure_mode ?? "degraded service"
      });
      for (const consumer of consumersOf.get(cur.id) ?? []) {
        queue.push({ id: consumer, distance: cur.distance + 1, via: `${cur.via} ─breaks→ ${consumer}` });
      }
    }

    const hops = [...best.values()].sort((a, b) => a.distance - b.distance || b.severity - a.severity);
    const blastScore = Math.min(100, Math.round(
      hops.reduce((s, h) => s + h.severity, 0) / Math.max(this.onto.areas.length, 1) * 1.6
    ));

    // Failure replay: integrity drains as each hop fails, ordered by distance.
    let integrity = 100;
    const cascade: CascadeStep[] = hops.map(h => {
      integrity = Math.max(0, integrity - Math.round(h.severity / 4));
      return {
        t: `T+${h.distance * 30}s`,
        area: h.area,
        event: h.distance === 0
          ? `change lands in ${h.area} — ${h.failure_mode}`
          : `${h.area} (depends on ${h.via.split(" ─breaks→ ").slice(-2)[0]}): ${h.failure_mode}`,
        integrity_after: integrity
      };
    });

    return {
      origin_areas: origins.map(a => a.id),
      total_areas_affected: hops.length,
      blast_score: blastScore,
      hops,
      cascade,
      grounded_in: "fabric-ontology"
    };
  }

  /** Shortest learning path: which single cert closes the most skill gap for an area. */
  recommendNextCert(heldCerts: string[], areaId: string): SemanticAnswer<OntologyCert | null> {
    const area = this.area(areaId);
    if (!area) return { value: null, path: [`area:${areaId} unknown`], grounded_in: "fabric-ontology" };
    const held = new Set(heldCerts.map(c => c.toUpperCase()));

    let best: OntologyCert | null = null;
    let bestCover = 0;
    for (const cert of this.onto.certifications) {
      if (held.has(cert.id.toUpperCase())) continue;
      const cover = cert.teaches.filter(s => area.demands.includes(s)).length
        + (area.required_certs.includes(cert.id) ? 2 : 0); // required certs win ties
      if (cover > bestCover) { best = cert; bestCover = cover; }
    }
    return {
      value: best,
      path: best
        ? [`area:${areaId} gap ─best-closed-by→ cert:${best.id} (covers ${bestCover} weighted demand${bestCover === 1 ? "" : "s"}, ~${best.hours ?? "?"}h study)`]
        : [`area:${areaId} — no cert in ontology closes remaining gap`],
      grounded_in: "merged"
    };
  }
}

export function createFabricIQ(dataDir: string): FabricIQ {
  return new FabricIQ(loadOntology(dataDir));
}

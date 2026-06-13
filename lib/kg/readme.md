# Repository Discovery and Knowledge Graph Construction

The diagram shows how a raw software repository is transformed into a structured, queryable
knowledge graph. The workflow combines deterministic code analysis with semantic inference so the
final graph represents both the repository's technical structure and the meaning of its artifacts.

![Repository discovery and knowledge graph construction workflow](../../assets/bandofagents.png)

*Figure: Repository ingestion, evidence extraction, entity and relationship construction, graph
validation, semantic enrichment, and persistence.*

## 1. Repository ingestion and artifact scanning

The process begins with a repository URL. The ingestion stage connects to the repository provider,
fetches the repository tree, and retrieves relevant files and metadata.

Typical metadata includes:

- repository-relative file path;
- filename and extension;
- detected programming language;
- file size and content;
- manifest or configuration-file type.

The scanner filters binaries, generated artifacts, oversized files, and unsupported formats. This
creates the discovery boundary: only artifacts successfully fetched and scanned can become graph
entities or participate in relationships.

The output of this stage is an inventory of repository artifacts prepared for analysis.

## 2. Evidence extraction

Each discovered artifact is analyzed through three complementary paths.

### Static parsing

Language-aware parsers inspect source-code syntax and extract explicit technical facts such as:

- imports and dependencies;
- function, class, and symbol declarations;
- function calls;
- API routes and handlers;
- test-to-module references.

Static parsing produces the most reliable evidence because it is derived directly from executable
structure rather than naming conventions.

### Heuristic signals

Heuristics interpret repository conventions such as:

- paths and directory names;
- filenames and extensions;
- manifest names;
- test-file patterns;
- deployment and CI/CD conventions.

For example, `*.test.ts` suggests a test artifact, while `Dockerfile` suggests deployment behavior.
These signals are useful across many repositories but remain probabilistic rather than definitive.

### Semantic signals

Semantic analysis extracts higher-level meaning from:

- documentation;
- test descriptions;
- requirements and specifications;
- external issue or document references;
- domain vocabulary found across artifacts.

This path helps connect implementation artifacts to concepts such as features, expected behavior,
requirements, and operational intent.

Using all three paths prevents the system from relying only on source-code syntax or only on
folder-name conventions.

## 3. Entity construction and role inference

The extracted evidence is combined to determine what each artifact represents.

Entities may include:

- files and modules;
- functions or classes;
- API endpoints;
- tests;
- features;
- requirements;
- configuration and deployment artifacts;
- external specification placeholders.

Each entity is assigned one or more roles. A single artifact may simultaneously be source code, an
API component, and part of a feature. Role inference should therefore be multi-label rather than
forcing every artifact into exactly one category.

Each inferred role carries:

- the evidence that supports it;
- a confidence score;
- the inference method used.

This makes the graph explainable and allows later consumers to distinguish strong structural facts
from weaker semantic hypotheses.

## 4. Entity resolution

Before relationships can be constructed, different references to the same entity must be
normalized.

For example:

```text
./users
src/users.ts
@app/users
```

may all refer to the same module.

Entity resolution uses path normalization, import aliases, package configuration, symbol names,
URLs, and identifiers to map references onto stable graph-node identities. Duplicate observations
are merged, while uncertain matches should remain unresolved to avoid introducing misleading
relationships.

This stage is essential because an extracted import or reference is only useful when its target can
be connected to a known entity.

## 5. Relationship construction

Resolved entities are connected through typed, directional edges.

### Structural edges

Structural edges represent relationships directly supported by code or machine-readable artifacts:

```text
module --imports--> dependency
function --calls--> function
test --tests--> module
directory --contains--> file
```

These edges form the repository's technical dependency graph and are generally high confidence.

### Semantic edges

Semantic edges connect technical artifacts to higher-level meaning:

```text
module --implements--> feature
document --documents--> API
configuration --configures--> service
deployment --deploys--> service
requirement --describes--> feature
```

These relationships may be inferred from documentation, shared vocabulary, explicit references,
dependency proximity, or language-model analysis. Because they involve interpretation, they should
preserve provenance and usually carry lower confidence than explicit structural edges.

Together, structural and semantic edges turn an artifact inventory into a knowledge graph.

## 6. Graph assembly and validation

The constructed nodes and edges are assembled into a unified graph.

Before the graph is accepted, an integrity pass:

- merges duplicate nodes and edges;
- removes relationships whose source or target does not exist;
- validates node and edge types;
- identifies unresolved references;
- checks graph coverage and connectivity.

This stage prevents malformed or contradictory construction results from reaching downstream
systems.

The graph should also retain quality indicators such as parse coverage, unresolved-import counts,
isolated nodes, and the proportion of deterministic versus inferred relationships. These indicators
communicate how complete and trustworthy the graph is.

## 7. Evidence, confidence, and provenance

Every inferred role and relationship should record why it exists.

For example:

```json
{
  "from": "tests/users.test.ts",
  "to": "src/users.ts",
  "type": "tests",
  "confidence": 0.92,
  "evidence": [
    "imports ../src/users",
    "matching users test filename"
  ],
  "method": "static-analysis-and-heuristics"
}
```

Provenance allows humans and downstream agents to distinguish:

- directly observed facts;
- convention-based inferences;
- semantic hypotheses.

Confidence can then be used to rank relationships, filter uncertain facts, and prioritize manual
review.

## 8. Semantic enrichment

After the deterministic graph is valid, an optional semantic-enrichment stage can improve its
readability and higher-level meaning.

Enrichment may:

- generate concise artifact summaries;
- infer architectural roles;
- group related artifacts into features;
- propose requirement-to-feature relationships;
- identify likely behavior and impact boundaries.

Semantic enrichment should extend the deterministic graph rather than overwrite reliable
structural facts. Proposed relationships should be marked as inferred and retain their supporting
evidence.

## 9. Persisted, versioned knowledge graph

The final graph is persisted as a versioned representation of the repository.

A simplified graph might contain:

```text
Requirement AUTH-42 --describes--> Login feature
Login route --implements--> Login feature
Login route --imports--> Authentication service
Authentication test --tests--> Login route
Deployment workflow --deploys--> Authentication service
```

Versioning allows the graph to be compared across commits or repository snapshots. This supports
questions such as:

- Which relationships changed?
- Which new artifacts appeared?
- Which tests are connected to a changed module?
- Which features and requirements may be affected?

The persisted knowledge graph becomes the common source of truth for visualization, repository
navigation, automated reasoning, and change-impact analysis.

## Workflow summary

The diagram can be understood as four main phases:

1. **Discover**  
   Fetch the repository and create a reliable artifact inventory.

2. **Understand**  
   Extract structural, heuristic, and semantic evidence to infer entity roles.

3. **Connect**  
   Resolve entity identities and construct structural and semantic relationships.

4. **Validate and persist**  
   Review graph integrity, attach evidence and confidence, enrich meaning, and save a versioned
   knowledge graph.

The central design principle is that structural analysis provides a reliable foundation, while
semantic inference gradually connects technical artifacts to features, requirements, and system
behavior.

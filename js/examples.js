// Built-in Examples (EXAMPLES map). Loading one overwrites Source.

const EXAMPLES = {
  sequence: `sequenceDiagram
    participant A as Client
    participant B as Server
    A->>B: Request
    B-->>A: Response`,
  er: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER {
        string name
        string email
    }`,
  flowchart: `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do thing]
    B -->|No| D[Skip]
    C --> E[End]
    D --> E`,
  class: `classDiagram
    class Animal {
      +String name
      +move()
    }
    class Dog {
      +bark()
    }
    Animal <|-- Dog`,
  gantt: `gantt
    title Project
    dateFormat  YYYY-MM-DD
    section Phase 1
    Task A :a1, 2026-01-01, 5d
    Task B :after a1, 3d`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Running : start
    Running --> Idle : stop
    Running --> [*]`,
};


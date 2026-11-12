flowchart TD
    subgraph ClientLayer ["Client Layer (Frontend)"]
        User["Borrower / Applicant"]
        Lender["Institutional Lender / Reviewer"]
        SPA["React 19 + Vite + Tailwind CSS\n(Framer Motion UI)"]
        User -->|Fills Intake| SPA
        Lender -->|Sign In / Review| SPA
    end

    subgraph SecurityLayer ["Security & Routing Layer"]
        APIGW["Amazon API Gateway (HTTP API v2)\n• CORS Enabled\n• $default Stage"]
        Cognito["Amazon Cognito User Pool\n• JWT Token Authorizer\n• Role-Based Access Control"]
        SPA -->|POST /score & GET /health| APIGW
        SPA -->|Authenticate| Cognito
        SPA -->|GET /lender/summary + Bearer JWT| APIGW
        Cognito -.->|Validates Token| APIGW
    end

    subgraph ComputeLayer ["Serverless Compute Layer"]
        Lambda["AWS Lambda Function\n(Node.js 20.x Express Handler)\n• Serverless Scoring Engine\n• Validation & Feature Standardization"]
        APIGW -->|Proxy Integration| Lambda
    end

    subgraph StorageLayer ["Persistence & Messaging Layer"]
        DDB[("Amazon DynamoDB\n(ApplicationsTable)\n• Key: applicationId\n• Pay-Per-Request")]
        S3[("Amazon S3 Bucket\n(ApplicationsBucket)\n• JSON Snapshot Archive\n• SSE-AES256 Encrypted")]
        SNS["Amazon SNS Topic\n(NotifyTopic)\n• Email Alert Broadcasts"]
        
        Lambda -->|PutItem Record| DDB
        Lambda -->|PutObject Snapshot JSON| S3
        Lambda -->|Publish Application Scored Event| SNS
    end

    subgraph ObservabilityLayer ["Observability & Governance"]
        CWLogs["Amazon CloudWatch Logs\n(/aws/lambda/creditclear-score)"]
        CWAlarm["Amazon CloudWatch Alarm\n(ScoringErrorAlarm)"]
        
        Lambda -->|Structured JSON Logs| CWLogs
        Lambda -->|Metric: Errors >= 1| CWAlarm
        CWAlarm -->|Trigger Alert| SNS
    end

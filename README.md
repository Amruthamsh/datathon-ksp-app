# datathon-ksp-app

An intelligent Chatbot agent that remembers context, handles complex inquiries about offenders across multiple cases, and assists in investigative research

Enables investigators, analysts, and policymakers to interact with the state crime database using natural language queries, while also providing advanced analytical capabilities grounded in criminology and sociological insights.

The proposed solution will enable users to discover hidden relationships between crimes, offenders, victims, locations, and socio-economic patterns, support investigative decision making, and provide predictive and preventive insights to strengthen proactive law enforcement.

The platform will go beyond simple data retrieval and enable:

• Crime pattern discovery
• Criminal network analysis
• Socio-demographic crime insights
• Behavioral and criminological profiling
• Proactive crime prevention intelligence

### Architecture of the SQL Agent Graph:

          Router
         /      \
      Chat      SQL Planner
                  |
           Fetch Values
                  |
             Generate SQL
                  |
             Execute SQL
                  |
              Response

## Code Setup

Run `catalyst serve` to start the server.

Then open http://localhost:3000/app/ for the client and http://localhost:3000/server/datathon-ksp-app/ for the function.

Run the following commands to generate fake data for testing:

`pip install faker --break-system-packages
python3 generate_fir_data.py`

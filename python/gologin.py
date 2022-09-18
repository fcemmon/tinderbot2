import requests
import psycopg2
import sys
from psycopg2 import OperationalError

def create_connection(db_name, db_user, db_password, db_host, db_port):
    connection = None
    try:
        connection = psycopg2.connect(
            database=db_name,
            user=db_user,
            password=db_password,
            host=db_host,
            port=db_port,
        )
        print("Connection to PostgreSQL DB successful")
    except OperationalError as e:
        print(f"The error '{e}' occurred")
    return connection

args = sys.argv[1:]
print(args[0])

url = "http://api.gologin.com/browser/v2?page="+args[0]
payload={}

# frank
# headers = {
#     'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MTM1MDZkZDUwZGQ2YjU0MzY2MDUxNjQiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2MjdlNzdhMzI3YTk0YjAyYzFmNzRkNzMifQ.q5BFuIaHGZBj-l8kweL1ITV5j2AuwwKgEMKZGYfO9mA'
# }
# prince
headers = {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjczMzJkMTc5ZTUwYTUyZTIwODI4ODQiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2Mjc0YWRmYjlmNDFiNzdkMDQ3OGQ4NWUifQ.Rv9z146Y7tknUXJz1wMNCpzczf9LKpfbzonZC1LLWFo'
}

# robert
# headers = {
#     'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MTBlNTYyZjU0OTRhOTliNmVkNGJiZDUiLCJ0eXBlIjoiZGV2Iiwiand0aWQiOiI2Mjc0NDI2MWZiNTdlZmMyNDMyMDgxZTMifQ.dAD_3NmUnp7rhlerc0sWi5zIzlOgglDUc8Q7d7AXrzg'
# }

response = requests.request("GET", url, headers=headers, data=payload)
print(response.text)

import requests
from dotenv import load_dotenv
import os

load_dotenv()

key=os.getenv("METROLINX_API_KEY")

URL = f"https://api.openmetrolinx.com/OpenDataAPI/api/V1/ServiceUpdate/UnionDepartures/All?key={key}"

def get_next_departure():
    resp = requests.get(URL, timeout=10)
    print("STATUS:", resp.status_code)
    return(resp.text)

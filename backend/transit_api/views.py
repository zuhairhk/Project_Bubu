import requests
from os import getenv
from django.http import JsonResponse
from dotenv import load_dotenv

load_dotenv()

def go_alerts(request):
    api_key = getenv("METROLINX_API_KEY")
    base_url = f'https://api.openmetrolinx.com/OpenDataAPI/api/V1/ServiceUpdate/UnionDepartures/All?key={api_key}'
    #headers = {"Ocp-Apim-Subscription-Key": getenv("METROLINX_API_KEY")}

    try:
        response = requests.get(base_url) #, headers=headers, timeout=10)
        response.raise_for_status()
        return JsonResponse(response.json(), safe=False)
    except requests.exceptions.RequestException as e:
        return JsonResponse({"error": str(e)}, status=500)

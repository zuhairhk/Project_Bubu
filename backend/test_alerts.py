from google.transit import gtfs_realtime_pb2

# Load binary .pb file
with open("alerts.pb", "rb") as f:
    data = f.read()

feed = gtfs_realtime_pb2.FeedMessage()
feed.ParseFromString(data)

for entity in feed.entity:
    if entity.HasField("alert"):
        header = entity.alert.header_text.translation[0].text
        desc = entity.alert.description_text.translation[0].text if entity.alert.description_text.translation else ""
        print(f"{header}\n{desc}\n")

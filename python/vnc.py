from vncdotool import api
client = api.connect('localhost:0', password=None)
for x in range(10):
    client.captureScreen('screenshot.png')
    print("ss1")
# for k in 'username':
#     client.keyPress(k)
# client.captureScreen('screenshot.png')

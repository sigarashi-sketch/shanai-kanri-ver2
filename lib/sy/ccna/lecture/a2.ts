import type { LecChapter } from './types';
// エリア2「スイッチング」の講義（2026-10-09 Claude が自作。市販の問題集やサイトの文は写していない）
export const A2: LecChapter[] = [
  {
    id: 'a2-01',
    area: 2,
    title: 'スイッチは どうやって 宛先を決めるのか',
    goal: 'スイッチが MAC アドレステーブルを作り、フレームを 転送・フラッディング・フィルタリングする しくみが わかる',
    body: `## スイッチの仕事は「正しいポートにだけ流す」こと
スイッチは、同じネットワークの中で パソコンやプリンタをつなぐ 箱です。届いたフレーム（イーサネットのデータのかたまり）を見て、どのポートから出せばよいかを決めます。このときに使う目印が **MAC アドレス** です。

昔の **ハブ** は、届いたデータを 全部のポートにそのまま流していました。これだと 関係のない機器にまでデータが届き、同時に送ると ぶつかり（コリジョン）も起きます。スイッチは「この宛先なら このポート」と覚えておくことで、必要なポートにだけ流します。だから速く、むだがありません。

## MAC アドレステーブルの学習
スイッチは 最初、何も知りません。覚え方はとても単純です。

1. フレームが届いたら、まず **送信元** の MAC アドレスを見る
2. 「この MAC アドレスの機器は、このポートの先にいる」と表に書く
3. 次に **宛先** の MAC アドレスを 表で探す

ポイントは、**覚えるのは送信元、探すのは宛先** ということです。宛先を見て覚えることは ありません。宛先の機器がまだ一度も話していなければ、場所は分からないからです。

この表を **MAC アドレステーブル**（CAM テーブルとも呼びます）といいます。しばらく通信のない行は消えます。Cisco のスイッチでは 初期値で **300 秒**（5分）です。機器を別のポートに差し替えても、古い情報が いつまでも残らないようにするためです。

## 3つの動き
| 動き | どんなとき | どうする |
|---|---|---|
| 転送（フォワーディング） | 宛先が表にあり、届いたポートとは別のポート | そのポートからだけ出す |
| フィルタリング | 宛先が表にあり、届いたポートと同じポート | どこにも出さず 捨てる |
| フラッディング | 宛先が表に無い（未知のユニキャスト）、またはブロードキャスト | 届いたポート以外の 全ポートに出す |

### 具体例
パソコンA（ポート1）が パソコンB（ポート2）に はじめて送るとします。

- スイッチは「A はポート1」と覚える
- B はまだ表に無いので、ポート1以外の 全部に フラッディング
- B が返事をすると、今度は「B はポート2」と覚える
- 返事の宛先 A は表にあるので、ポート1にだけ 転送

こうして 通信するほど 表が埋まり、フラッディングは減っていきます。

ブロードキャスト（宛先が FFFF.FFFF.FFFF）は「全員あて」なので、表に関係なく いつもフラッディングされます。このブロードキャストが届く範囲を **ブロードキャストドメイン** といいます。スイッチだけでつないだ範囲は、ひとつのブロードキャストドメインです。

## 表を見るコマンド
~~~
Switch# show mac address-table
          Mac Address Table
-------------------------------------------
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
   1    0011.2233.4455    DYNAMIC     Gi0/1
   1    0011.2233.6677    DYNAMIC     Gi0/2
~~~
DYNAMIC は「学習して覚えた行」という意味です。手で登録した行は STATIC と表示されます。

> まとめ: 送信元で覚えて、宛先で探す。見つかれば そこへ、見つからなければ みんなへ。`,
    quiz: [
      { text: 'スイッチは 届いたフレームの［送信元］MAC アドレスを見て、MAC アドレステーブルに 書き込みます。', extra: ['宛先', '送信元IP', 'ゲートウェイ'], explain: '覚えるのは送信元、表で探すのは宛先です。' },
      { text: '宛先 MAC アドレスが 表に無いフレームは、届いたポート以外の 全ポートへ［フラッディング］されます。', extra: ['フィルタリング', 'フォワーディング', 'ブロッキング'], explain: '場所が分からないので、全員に送って探します。' },
      { text: '宛先が 届いたポートと同じポートの先にいるとき、スイッチは フレームを［フィルタリング］して 捨てます。', extra: ['フラッディング', 'フォワーディング', 'カプセル化'], explain: '同じポートに戻す必要はないので、どこにも出しません。' },
      { text: 'Cisco スイッチの MAC アドレステーブルの行は、通信がないと 初期値で［300］秒たつと 消えます。', extra: ['60', '180', '30'], explain: 'エージングタイムの初期値は 300 秒（5分）です。' },
      { text: 'MAC アドレステーブルを 表示するコマンドは show mac［address-table］です。', extra: ['arp-table', 'route-table', 'vlan brief'], explain: 'Type 列が DYNAMIC なら 学習で覚えた行です。' },
      { text: 'ブロードキャストが 届く範囲を［ブロードキャストドメイン］といい、スイッチだけでつないだ範囲は ひとつになります。', extra: ['コリジョンドメイン', 'サブネットマスク', 'VLAN ID'], explain: 'ブロードキャストは表に関係なく 全ポートに流れます。' },
    ],
  },
  {
    id: 'a2-02',
    area: 2,
    title: 'VLAN で ネットワークを 分ける',
    goal: 'VLAN を作り、アクセスポートと 音声 VLAN を設定して、show vlan brief で確かめられる',
    body: `## なぜ分けたいのか
1章で、スイッチだけでつないだ範囲は ひとつのブロードキャストドメインだと学びました。会社の全員を 1台のスイッチ群でつなぐと、だれかのブロードキャストが 全員に届きます。人数が増えるほど むだな通信が増え、営業部の機器と 経理部の機器が 自由に話せてしまうので 安全面でも困ります。

そこで使うのが **VLAN**（仮想 LAN）です。1台のスイッチの中を、見えない壁で いくつかのグループに分けます。**1つの VLAN = 1つのブロードキャストドメイン** です。VLAN 10 のブロードキャストは VLAN 20 には届きません。

## VLAN の番号
| 範囲 | 意味 |
|---|---|
| 1 | 初期値の VLAN。最初は全ポートがここ。消せない |
| 2〜1001 | ふつうに使う範囲 |
| 1002〜1005 | 古い規格用に予約。消せない |
| 1006〜4094 | 拡張範囲 |

## 作って ポートに割り当てる
VLAN を作り、名前を付けます。
~~~
Switch(config)# vlan 10
Switch(config-vlan)# name EIGYO
Switch(config-vlan)# vlan 20
Switch(config-vlan)# name KEIRI
~~~
パソコンをつなぐポートは **アクセスポート** にします。アクセスポートは **1つの VLAN だけ** に属するポートです。パソコンは VLAN のことを知らないので、スイッチが「このポートは VLAN 10」と決めてあげます。
~~~
Switch(config)# interface gigabitEthernet0/1
Switch(config-if)# switchport mode access
Switch(config-if)# switchport access vlan 10
~~~
存在しない VLAN をポートに割り当てると、多くの機種では その VLAN が自動で作られます。

## 音声 VLAN
会社の机では、IP 電話の裏のポートにパソコンをつなぎ、電話だけがスイッチにつながる という配線がよくあります。ケーブル1本で、電話の音声とパソコンのデータが 両方流れます。

音声は 少しでも遅れると 声が途切れるので、データとは分けて 優先して扱いたいところです。そこで **音声 VLAN** を使います。
~~~
Switch(config-if)# switchport mode access
Switch(config-if)# switchport access vlan 10
Switch(config-if)# switchport voice vlan 110
~~~
こうすると パソコンのデータは VLAN 10（タグなし）、電話の音声は VLAN 110（タグ付き）で流れます。どの VLAN を使えばよいかは、スイッチが **CDP** で電話に教えます。1つのポートに2つの VLAN が流れますが、このポートは アクセスポートとして扱われます。

## 確かめる
~~~
Switch# show vlan brief
VLAN Name        Status    Ports
---- ----------- --------- ----------------
1    default     active    Gi0/3, Gi0/4
10   EIGYO       active    Gi0/1
20   KEIRI       active    Gi0/2
~~~
ここに出るのは **アクセスポート** だけです。次の章で学ぶ トランクポートは、この一覧には出ないので 注意してください。

> VLAN が違う機器どうしは、そのままでは通信できません。通すには ルータの力が必要です（4章）。`,
    quiz: [
      { text: '1つの VLAN は 1つの［ブロードキャストドメイン］になります。', extra: ['コリジョンドメイン', 'サブネット番号', 'ルーティングテーブル'], explain: 'VLAN が違えば ブロードキャストは届きません。' },
      { text: 'スイッチの 初期値の VLAN は VLAN［1］で、最初は 全ポートがここに属し、消すこともできません。', extra: ['0', '10', '1002'], explain: 'VLAN 1 はデフォルト VLAN です。' },
      { text: 'パソコンをつなぐ ポートは、1つの VLAN だけに属する［アクセス］ポートにします。', extra: ['トランク', 'ルーテッド', 'ダイナミック'], explain: 'switchport mode access で設定します。' },
      { text: 'ポートを VLAN 10 に割り当てるコマンドは switchport［access］vlan 10 です。', extra: ['trunk', 'native', 'mode'], explain: 'インターフェイスの設定モードで入力します。' },
      { text: 'IP 電話の音声を 別の VLAN に流すには switchport［voice］vlan コマンドを使い、使う VLAN は［CDP］で電話に伝えます。', extra: ['native', 'access', 'DTP', 'STP'], explain: '音声 VLAN の番号は CDP で電話に知らせます。' },
      { text: '［show vlan brief］の一覧には アクセスポートだけが出て、トランクポートは出ません。', extra: ['show mac address-table', 'show cdp neighbors', 'show ip interface brief'], explain: 'VLAN ごとの所属ポートを 短く表示するコマンドです。' },
    ],
  },
  {
    id: 'a2-03',
    area: 2,
    title: 'トランクで 複数の VLAN を運ぶ',
    goal: '802.1Q のタグ・ネイティブ VLAN・許可 VLAN・DTP の組み合わせが わかり、トランクを設定できる',
    body: `## スイッチどうしを つなぐとき
2台のスイッチの両方に VLAN 10 と VLAN 20 があるとします。VLAN ごとにケーブルを1本ずつ引くと、VLAN が増えるたびにケーブルもポートも足りなくなります。そこで、**1本のケーブルで 複数の VLAN を運ぶ** のが **トランク** です。

1本に まとめて流すと、受け取った側は「このフレームは どの VLAN のものか」が分かりません。そこで、フレームに **VLAN の番号札（タグ）** を付けて送ります。

## IEEE 802.1Q
タグの付け方の標準が **IEEE 802.1Q**（ドットワンキュー）です。フレームの中に **4 バイト** のタグを差し込みます。タグの中で VLAN 番号を表す部分は **12 ビット** なので、使える番号は 1〜4094 です。昔は Cisco 独自の ISL という方式もありましたが、いまは 802.1Q が使われます。

## ネイティブ VLAN
802.1Q には1つ例外があります。**ネイティブ VLAN のフレームには タグを付けません**。タグの付いていないフレームがトランクに届いたら、受け取った側は「ネイティブ VLAN のもの」とみなします。初期値は **VLAN 1** です。

ネイティブ VLAN は **両端で同じ番号** にそろえる必要があります。片方が 1、もう片方が 99 だと、タグなしのフレームが 別の VLAN に紛れ込んでしまいます。Cisco 機器どうしなら CDP が「ネイティブ VLAN が合っていません」と警告を出します。

## 設定
~~~
Switch(config)# interface gigabitEthernet0/24
Switch(config-if)# switchport trunk encapsulation dot1q
Switch(config-if)# switchport mode trunk
Switch(config-if)# switchport trunk native vlan 99
Switch(config-if)# switchport trunk allowed vlan 10,20,99
~~~
- 1行目の encapsulation は、ISL も使える機種でだけ必要です（どちらか決めないと トランクにできない）
- allowed vlan は **トランクに通してよい VLAN** の一覧です。初期値は全部（1〜4094）。不要な VLAN を通さないと、むだなブロードキャストを減らせます
- あとから足すときは switchport trunk allowed vlan add 30 のように add を付けます。add を忘れると 一覧が上書きされ、通信が止まります

## DTP（自動でトランクにする しくみ）
Cisco のスイッチには、相手と話し合って トランクにするか決める **DTP** という Cisco 独自の機能があります。
| 自分 ＼ 相手 | dynamic auto | dynamic desirable | trunk | access |
|---|---|---|---|---|
| dynamic auto | アクセス | トランク | トランク | アクセス |
| dynamic desirable | トランク | トランク | トランク | アクセス |
| trunk | トランク | トランク | トランク | 使えない |

覚え方: **desirable は「トランクにしたい」と自分から誘う**、**auto は「誘われたら なる」**。auto どうしは どちらも誘わないので、トランクになりません。

知らない機器と勝手にトランクになると危ないので、実際の現場では mode を trunk か access に決め打ちし、switchport nonegotiate で DTP を止めることが多いです。

## 確かめる
~~~
Switch# show interfaces trunk
~~~
モード・カプセル化・ネイティブ VLAN・許可 VLAN が 1度に見られます。`,
    quiz: [
      { text: 'トランクで使う 標準のタグ方式は IEEE［802.1Q］で、フレームに［4］バイトのタグを差し込みます。', extra: ['802.3ad', '802.1D', '8', '2'], explain: '802.1Q のタグは 4 バイト、VLAN 番号部分は 12 ビットです。' },
      { text: 'IEEE 802.1Q では、［ネイティブ］VLAN のフレームには タグを付けません。', extra: ['デフォルト', '音声', '管理'], explain: 'タグなしで届いたフレームは ネイティブ VLAN とみなされます。' },
      { text: 'ネイティブ VLAN の初期値は VLAN［1］で、トランクの 両端で 同じ番号にそろえる必要があります。', extra: ['99', '1002', '4094'], explain: '両端で違うと、Cisco 機器なら CDP が警告を出します。' },
      { text: 'トランクに VLAN 30 を 追加で通すときは switchport trunk allowed vlan［add］30 と入力します。', extra: ['remove', 'except', 'all'], explain: 'add を忘れると 許可 VLAN の一覧が 上書きされます。' },
      { text: 'DTP で 両端が［dynamic auto］どうしだと、どちらも誘わないので トランクになりません。', extra: ['dynamic desirable', 'trunk', 'nonegotiate'], explain: 'auto は誘われたらなるだけなので、auto どうしは アクセスのままです。' },
      { text: 'DTP の話し合いを止めるコマンドはswitchport［nonegotiate］です。', extra: ['negotiate', 'portfast', 'mode dynamic'], explain: 'モードを決め打ちして DTP を止めるのが安全です。' },
      { text: 'トランクの状態と 許可 VLAN を確かめるコマンドは show interfaces［trunk］です。', extra: ['status', 'counters', 'description'], explain: 'トランクは show vlan brief には出ないので、こちらで見ます。' },
    ],
  },
  {
    id: 'a2-04',
    area: 2,
    title: 'VLAN どうしを つなぐ（VLAN 間ルーティング）',
    goal: 'ルータオンアスティック・SVI・レイヤ3スイッチの 3つのやり方の違いと 設定が わかる',
    body: `## VLAN が違うと なぜ話せないのか
VLAN 10 と VLAN 20 は、別々のネットワーク（別のサブネット）です。たとえば VLAN 10 は 192.168.10.0/24、VLAN 20 は 192.168.20.0/24 のように分けます。別のネットワークへ行くには、ルータ（またはルーティングできる機器）が必要です。これを **VLAN 間ルーティング** といいます。

各 VLAN のパソコンは、自分の VLAN の デフォルトゲートウェイ（例: 192.168.10.1）にデータを渡し、そこから 相手の VLAN へ運んでもらいます。

## やり方1: ルータオンアスティック
ルータの物理ポート1つと スイッチを **トランク** でつなぎ、ルータ側のポートを **サブインターフェース** に分けます。1本の棒（stick）の先にルータがぶら下がっている形なので、**ルータオンアスティック**（ROAS）と呼びます。
~~~
Router(config)# interface gigabitEthernet0/0
Router(config-if)# no shutdown
Router(config)# interface gigabitEthernet0/0.10
Router(config-subif)# encapsulation dot1Q 10
Router(config-subif)# ip address 192.168.10.1 255.255.255.0
Router(config)# interface gigabitEthernet0/0.20
Router(config-subif)# encapsulation dot1Q 20
Router(config-subif)# ip address 192.168.20.1 255.255.255.0
~~~
- サブインターフェースの番号（.10）は 何でもよいですが、VLAN 番号とそろえると分かりやすいです
- **encapsulation dot1Q 10** が「このサブインターフェースは VLAN 10 のタグを担当する」という意味です
- ネイティブ VLAN を担当させるときは encapsulation dot1Q 99 native と書きます
- スイッチ側のポートは トランクにしておきます

安く作れますが、全 VLAN の通信が 1本のケーブルを行って戻るので、混みやすいのが弱点です。

## やり方2: SVI（レイヤ3スイッチ）
**レイヤ3スイッチ** は、スイッチなのに ルーティングもできる機器です。VLAN ごとに **SVI**（スイッチ仮想インターフェース）という 仮想のポートを作り、そこに IP アドレスを付けます。
~~~
Switch(config)# ip routing
Switch(config)# interface vlan 10
Switch(config-if)# ip address 192.168.10.1 255.255.255.0
Switch(config-if)# no shutdown
Switch(config)# interface vlan 20
Switch(config-if)# ip address 192.168.20.1 255.255.255.0
Switch(config-if)# no shutdown
~~~
**ip routing** を忘れると、SVI 同士の間で ルーティングされません。スイッチの中で処理するので、ルータオンアスティックより ずっと速いです。

SVI が up になるには、次の条件がそろう必要があります。
1. その VLAN がスイッチに作られている
2. その VLAN で up になっているポート（アクセス、または その VLAN を通すトランク）が 1つ以上ある
3. SVI が shutdown されていない

## やり方3: ルーテッドポート
レイヤ3スイッチの 物理ポートを、ルータのポートのように使うこともできます。**no switchport** と入力すると、そのポートは VLAN に属さない **ルーテッドポート** になり、直接 IP アドレスを付けられます。ルータや 別のレイヤ3スイッチとの接続に使います。
~~~
Switch(config)# interface gigabitEthernet0/48
Switch(config-if)# no switchport
Switch(config-if)# ip address 10.0.0.1 255.255.255.252
~~~

| やり方 | 機器 | 速さ |
|---|---|---|
| ルータオンアスティック | ルータ＋トランク | ふつう |
| SVI | レイヤ3スイッチ | 速い |
| ルーテッドポート | レイヤ3スイッチ | 速い（機器どうしの接続用） |`,
    quiz: [
      { text: 'ルータの1つの物理ポートを トランクでつなぎ、［サブインターフェース］に分けて VLAN 間ルーティングする方式を ルータオンアスティックといいます。', extra: ['SVI', 'ルーテッドポート', 'ループバック'], explain: 'g0/0.10 のように 物理ポートを分けて使います。' },
      { text: 'サブインターフェースに VLAN 10 を担当させるコマンドは［encapsulation］dot1Q 10 です。', extra: ['switchport', 'interface', 'channel-group'], explain: 'そのサブインターフェースが VLAN 10 のタグを扱う という意味です。' },
      { text: 'レイヤ3スイッチで VLAN ごとに作る 仮想のインターフェースを［SVI］といいます。', extra: ['DTP', 'BPDU', 'CAPWAP'], explain: 'interface vlan 10 で作り、IP アドレスを付けます。' },
      { text: 'レイヤ3スイッチで SVI 同士をルーティングさせるには、グローバル設定で［ip routing］を入力します。', extra: ['router ospf', 'ip default-gateway', 'switchport mode trunk'], explain: '忘れると SVI 同士の間で ルーティングされません。' },
      { text: 'レイヤ3スイッチの 物理ポートで［no switchport］と入力すると、ルーテッドポートになります。', extra: ['switchport mode access', 'no shutdown', 'switchport nonegotiate'], explain: 'VLAN に属さず、直接 IP アドレスを付けられるポートになります。' },
      { text: 'SVI が up になるには、その VLAN が作られていて、その VLAN で up のポートが［1］つ以上 必要です。', extra: ['2', '0', '4'], explain: 'VLAN があり、使えるポートがあり、shutdown されていないことが条件です。' },
    ],
  },
  {
    id: 'a2-05',
    area: 2,
    title: 'ループを防ぐ STP と RSTP',
    goal: 'ルートブリッジの選び方、ポートの役割と状態、PortFast と BPDU ガード・ルートガードの使いどころが わかる',
    body: `## なぜ ループが こわいのか
スイッチを2本のケーブルでつなぐと、1本が切れても通信が続くので安心です。ところが、ブロードキャストはスイッチ間を **ぐるぐる回り続け**、増え続けて ネットワークが止まります（**ブロードキャストストーム**）。イーサネットのフレームには「何回まで回ったら捨てる」という仕組みが無いためです。MAC アドレステーブルの場所も ころころ変わってしまいます。

そこで **STP**（スパニングツリープロトコル・IEEE 802.1D）が、予備の道を **わざと止めて**、ループのない木の形を作ります。本線が切れたら 止めていた道を開けます。スイッチどうしは **BPDU** というメッセージを送り合って相談します。

## 手順1: ルートブリッジを決める
木の根っこになるスイッチを **ルートブリッジ** といいます。**ブリッジ ID が いちばん小さい** スイッチが選ばれます。

ブリッジ ID ＝ **プライオリティ** ＋ **MAC アドレス**
- プライオリティの初期値は **32768**。変えるときは **4096 の倍数**
- Cisco の PVST+ では VLAN ごとに STP が動くので、プライオリティに VLAN 番号を足します（**拡張システム ID**）。VLAN 1 なら 32768＋1＝32769
- プライオリティが同じなら、MAC アドレスの小さい方が勝ちます

放っておくと 古くて MAC アドレスが小さいだけのスイッチが根っこになりかねないので、ふつうは 手で決めます。
~~~
Switch(config)# spanning-tree vlan 10 root primary
Switch(config)# spanning-tree vlan 10 priority 4096
~~~

## 手順2: コストで 道を選ぶ
ルートブリッジまでの「遠さ」を **コスト** で測ります。速い線ほど コストが小さいです。
| 速度 | コスト |
|---|---|
| 10 Mbps | 100 |
| 100 Mbps | 19 |
| 1 Gbps | 4 |
| 10 Gbps | 2 |

## ポートの役割
| 役割 | 意味 |
|---|---|
| ルートポート | ルートブリッジ以外の各スイッチで、根っこに いちばん近いポート（1つ） |
| 指定ポート | 線ごとに、根っこ側の 送り出し役（ルートブリッジのポートは全部これ） |
| 非指定ポート | 残り。止める（RSTP では 代替ポート・バックアップポート） |

コストが同じときは、相手のブリッジ ID、相手のポートの番号の順で 小さい方を選びます。

## ポートの状態
802.1D は ブロッキング → リスニング（15秒）→ ラーニング（15秒）→ フォワーディング と進みます。ループを起こさないよう 慎重なので、使えるまで 30〜50 秒かかります。

これを速くしたのが **RSTP**（802.1w）です。状態は **ディスカーディング・ラーニング・フォワーディング** の3つで、数秒で切り替わります。Cisco では spanning-tree mode rapid-pvst で使えます。

## 守りの機能
- **PortFast**: パソコンをつなぐポートで、待ち時間を飛ばして すぐ フォワーディングにします。ループの心配がないポート専用です
- **BPDU ガード**: PortFast のポートに BPDU が届いたら（だれかがスイッチをつないだら）、ポートを **err-disabled** にして止めます
- **ルートガード**: そのポートの先から「自分がルートだ」という 強い BPDU が来ても 受け入れず、ポートを止めます。ルートブリッジの場所を守る機能です
~~~
Switch(config-if)# spanning-tree portfast
Switch(config-if)# spanning-tree bpduguard enable
Switch(config-if)# spanning-tree guard root
~~~`,
    quiz: [
      { text: 'STP では［ブリッジ ID］が いちばん小さいスイッチが ルートブリッジに選ばれます。', extra: ['ポート番号', 'IP アドレス', 'コスト'], explain: 'ブリッジ ID はプライオリティと MAC アドレスでできています。' },
      { text: 'STP のプライオリティの初期値は［32768］で、変えるときは［4096］の倍数にします。', extra: ['1', '1024', '65535', '100'], explain: 'VLAN 番号を足す拡張システム ID があるため、4096 刻みです。' },
      { text: 'PVST+ では プライオリティに VLAN 番号を足す［拡張システム ID］があり、VLAN 1 の初期値は 32769 になります。', extra: ['ポート ID', 'ネイティブ VLAN', 'BPDU ガード'], explain: '32768＋1＝32769 です。' },
      { text: 'STP のコストは 1 Gbps で［4］、100 Mbps で［19］です。', extra: ['2', '100', '10', '1'], explain: '速い線ほど コストが小さくなります。' },
      { text: 'RSTP のポートの状態は ディスカーディング・ラーニング・［フォワーディング］の3つです。', extra: ['リスニング', 'ブロッキング', 'ディセーブル'], explain: '802.1D のブロッキングとリスニングは ディスカーディングにまとめられました。' },
      { text: 'PortFast のポートに BPDU が届いたとき、ポートを err-disabled にして止める機能を［BPDU ガード］といいます。', extra: ['ルートガード', 'PortFast', 'DTP'], explain: 'パソコン用のポートに スイッチをつながれるのを防ぎます。' },
      { text: '［ルートガード］は、ポートの先から 強い BPDU が来ても受け入れず、ルートブリッジの場所を守ります。', extra: ['BPDU ガード', 'PortFast', 'ポートセキュリティ'], explain: 'spanning-tree guard root で設定します。' },
    ],
  },
  {
    id: 'a2-06',
    area: 2,
    title: 'EtherChannel と 隣の機器を知る CDP・LLDP',
    goal: 'EtherChannel のモードの組み合わせと、CDP・LLDP の違いが わかる',
    body: `## 線を束ねて 1本にする
スイッチ間の通信が増えたので、ケーブルを2本に増やしたとします。ところが 5章の STP は「ループだ」と判断して 1本を止めてしまいます。せっかくの2本目が 予備にしかなりません。

**EtherChannel** は、複数の物理リンクを **1本の論理リンク** として束ねる技術です。STP からは 1本に見えるので止められず、全部の線を 同時に使えます。1本切れても 残りで通信が続きます。最大で **8本** まで同時に使えます。

束ねたものは **ポートチャネル**（interface port-channel 1 など）として設定します。

## 束ね方は 3種類
| 方式 | 種類 | モード |
|---|---|---|
| LACP | 標準（IEEE 802.3ad） | active / passive |
| PAgP | Cisco 独自 | desirable / auto |
| スタティック | 話し合いなし | on |

### 組み合わせ（ここが試験に出ます）
- **active ＋ active** → 束ねる
- **active ＋ passive** → 束ねる
- **passive ＋ passive** → 束ねない（どちらも待っているだけ）
- **desirable ＋ desirable**、**desirable ＋ auto** → 束ねる
- **auto ＋ auto** → 束ねない
- **on ＋ on** → 束ねる。on は相手が LACP や PAgP だと束ねない

覚え方は 3章の DTP と同じで、**自分から誘う側（active・desirable）が 1台でもあれば成立**、待つ側どうしは成立しません。LACP と PAgP は 混ぜられません。

~~~
Switch(config)# interface range gigabitEthernet0/1 - 2
Switch(config-if-range)# channel-group 1 mode active
Switch# show etherchannel summary
~~~

束ねるポートは、**速度・デュプレックス・アクセスかトランクか・VLAN の設定** をそろえる必要があります。ちがうと束ねられません。

どの線に流すかは、送信元や宛先の MAC アドレス・IP アドレスから 計算して決めます（ロードバランス）。同じ通信は 同じ線に流れるので、1つの通信が 2本分の速さになるわけではありません。

## 隣の機器を知る CDP と LLDP
ネットワークの図が手元に無いとき、「このポートの先には何がつながっているのか」を知りたくなります。そこで使うのが **CDP** と **LLDP** です。どちらも 隣に直接つながった機器に、自分の名前・機種・ポート番号・IP アドレスなどを 定期的に知らせます。

| | CDP | LLDP |
|---|---|---|
| 種類 | Cisco 独自 | 標準（IEEE 802.1AB） |
| 送る間隔 | 60 秒 | 30 秒 |
| 保持時間 | 180 秒 | 120 秒 |
| 初期状態（Cisco 機器） | 有効 | 無効が多い |

~~~
Switch# show cdp neighbors
Switch# show cdp neighbors detail
Switch(config)# lldp run
Switch# show lldp neighbors
~~~
detail を付けると 相手の IP アドレスや OS のバージョンまで見えます。便利な反面、外部に面したポートでは 情報を 知られたくありません。その場合は インターフェースで no cdp enable、機器全体なら no cdp run で止めます。`,
    quiz: [
      { text: '複数の物理リンクを 1本の論理リンクとして束ねる技術を［EtherChannel］といいます。', extra: ['トランク', 'スパニングツリー', 'VLAN'], explain: 'STP から1本に見えるので、全部の線を使えます。' },
      { text: 'LACP のモードは［active］と passive で、passive どうしでは 束ねられません。', extra: ['desirable', 'auto', 'on'], explain: '自分から誘う active が 1台でもあれば成立します。' },
      { text: 'Cisco 独自の PAgP のモードは desirable と［auto］で、auto どうしでは 束ねられません。', extra: ['passive', 'active', 'on'], explain: 'desirable が誘う側、auto は待つ側です。' },
      { text: '話し合いをせずに 束ねるモードは［on］で、相手も同じモードのときだけ 束ねられます。', extra: ['active', 'desirable', 'trunk'], explain: 'on は LACP や PAgP の相手とは 束ねません。' },
      { text: 'LACP は 標準規格の IEEE［802.3ad］です。', extra: ['802.1Q', '802.1AB', '802.1w'], explain: 'PAgP は Cisco 独自です。' },
      { text: 'CDP は Cisco 独自で、標準規格の［LLDP］は IEEE 802.1AB で決められています。', extra: ['LACP', 'DTP', 'PAgP'], explain: 'どちらも 隣の機器の情報を知るための仕組みです。' },
      { text: 'CDP は［60］秒ごとに送り、LLDP は［30］秒ごとに送ります。', extra: ['10', '120', '180'], explain: '保持時間は CDP が 180 秒、LLDP が 120 秒です。' },
    ],
  },
  {
    id: 'a2-07',
    area: 2,
    title: '無線 LAN と 機器への 管理アクセス',
    goal: '無線の周波数と規格、AP と WLC の関係、機器へ安全にログインする方法が わかる',
    body: `## 電波の通り道
無線 LAN は **2.4 GHz 帯** と **5 GHz 帯**（新しい機器は 6 GHz 帯も）を使います。
- **2.4 GHz**: 遠くまで届き 壁にも強いが、電子レンジなどと混ざりやすい。重ならないチャネルは **1・6・11** の3つだけ
- **5 GHz**: 速くて 重ならないチャネルが多いが、遠くには届きにくい

となりの AP 同士は、重ならないチャネルを 交互に使って 干渉を防ぎます。

| 規格 | 周波数 | 最大速度の目安 |
|---|---|---|
| 802.11b | 2.4 GHz | 11 Mbps |
| 802.11a | 5 GHz | 54 Mbps |
| 802.11g | 2.4 GHz | 54 Mbps |
| 802.11n（Wi-Fi 4） | 2.4 / 5 GHz | 600 Mbps |
| 802.11ac（Wi-Fi 5） | 5 GHz | 数 Gbps |
| 802.11ax（Wi-Fi 6） | 2.4 / 5 GHz（6E は 6 GHz も） | 数 Gbps |

## 言葉の整理
- **SSID**: 無線ネットワークの名前。スマホの一覧に出るもの
- **BSS**: 1台の AP と、そこにつながる端末のまとまり。AP の無線の MAC アドレスを **BSSID** といいます
- **ESS**: 同じ SSID の AP を何台も並べ、有線でつないだもの。歩いても 切れずに AP を乗り換えられます（ローミング）
- **IBSS**: AP を使わず 端末どうしで直接つなぐ形（アドホック）

## AP の種類
| 種類 | 特徴 |
|---|---|
| 自律型 AP | 1台ずつ 個別に設定する。小さな事務所向け |
| Lightweight AP | 設定や管理を **WLC**（無線 LAN コントローラ）に任せる。大きな建物向け |
| クラウド型 AP | インターネット上の管理画面で まとめて管理する |

AP が 何十台もあると、1台ずつ設定するのは大変です。そこで Lightweight AP は、電波を出す仕事だけを自分で行い、認証や設定は WLC に任せます（**スプリット MAC**）。AP と WLC の間は **CAPWAP** というトンネルでつなぎます。制御は UDP **5246**、データは UDP **5247** を使い、制御側は必ず暗号化されます。

AP には動き方（モード）があります。ふつうに端末をつなぐ **ローカル**、WLC が遠くの拠点でも 通信をその場で流せる **FlexConnect**、電波を見張るだけの **モニター**、通信を拾って解析する **スニファー** などです。

WLC の物理ポートには、管理専用の **サービスポート**、データを流す **ディストリビューションシステムポート**（束ねて LAG にできる）、**コンソールポート** があります。論理的なインターフェースとして、管理用の **管理インターフェース**、WLAN（SSID）を VLAN に結びつける **ダイナミックインターフェース** などがあります。

## 機器へのログイン
| 方法 | 番号 | 安全さ |
|---|---|---|
| コンソール | ケーブル直結 | その場にいる人だけ |
| Telnet | TCP 23 | 暗号化なし（パスワードが丸見え） |
| SSH | TCP 22 | 暗号化あり |
| HTTP | TCP 80 | 暗号化なし |
| HTTPS | TCP 443 | 暗号化あり |

遠くからは **SSH** を使います。
~~~
Switch(config)# hostname SW1
SW1(config)# ip domain-name example.local
SW1(config)# crypto key generate rsa modulus 2048
SW1(config)# username admin secret Str0ng!Pass2026
SW1(config)# ip ssh version 2
SW1(config)# line vty 0 15
SW1(config-line)# login local
SW1(config-line)# transport input ssh
~~~
機器が増えると、ユーザーを1台ずつ作るのは大変です。そこで 認証サーバーにまとめます。**TACACS+** は Cisco 発祥で TCP 49、通信の中身を全部暗号化し、機器の管理向きです。**RADIUS** は標準で UDP 1812/1813、暗号化はパスワードだけで、無線やネットワークへの接続の認証によく使われます。`,
    quiz: [
      { text: '2.4 GHz 帯で 重ならないチャネルは 1・［6］・11 の3つです。', extra: ['5', '3', '7'], explain: 'となりの AP は 1・6・11 を交互に使います。' },
      { text: '同じ SSID の AP を何台も並べ、ローミングできるようにしたまとまりを［ESS］といいます。', extra: ['BSS', 'IBSS', 'BSSID'], explain: '1台の AP のまとまりは BSS です。' },
      { text: '［Lightweight］AP は、設定や管理を WLC に任せる AP です。', extra: ['自律型', 'クラウド型', 'アドホック'], explain: '電波の仕事だけ AP、管理は WLC が行います（スプリット MAC）。' },
      { text: 'Lightweight AP と WLC の間は［CAPWAP］というトンネルでつなぎ、制御には UDP［5246］を使います。', extra: ['LACP', 'DTP', '5247', '1812'], explain: 'データは UDP 5247、制御は UDP 5246 です。' },
      { text: 'WLC で WLAN（SSID）を VLAN に結びつけるのは［ダイナミック］インターフェースです。', extra: ['管理', 'サービスポート', 'コンソール'], explain: 'SSID ごとに 流す VLAN を決めます。' },
      { text: '［SSH］は 通信を暗号化して 機器にログインする方法で、TCP［22］を使います。', extra: ['Telnet', 'HTTP', '23', '80'], explain: 'Telnet は TCP 23 で 暗号化しません。' },
      { text: '［TACACS+］は TCP 49 を使い 中身を全部暗号化し、RADIUS は UDP を使い パスワードだけを暗号化します。', extra: ['RADIUS', 'LLDP', 'CAPWAP'], explain: 'TACACS+ は機器の管理向き、RADIUS は接続の認証によく使われます。' },
    ],
  },
];

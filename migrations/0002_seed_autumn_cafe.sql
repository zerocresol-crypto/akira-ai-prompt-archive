-- Autumn Café Collection の編集用下書き。カットと画像は未登録。
INSERT INTO series(slug,title,concept,start_date,end_date,status)
VALUES(
  'autumn-cafe-collection',
  'Autumn Café Collection',
  '秋の味覚とカフェファッション。食材の色から衣装と店内を設計し、朝のテラス・窓辺と夜の間接照明・街灯で時間帯ごとの空気を描く。',
  '2026-10-04','2026-10-10','draft'
);
INSERT INTO days(series_id,slug,title,date,day_order,description) VALUES
((SELECT id FROM series WHERE slug='autumn-cafe-collection'),'sunday','アップルパイ','2026-10-04',0,'焼きりんごの赤とパイ生地の金色をカフェファッションへ。'),
((SELECT id FROM series WHERE slug='autumn-cafe-collection'),'monday','モンブラン','2026-10-05',1,'栗色とクリームの柔らかな層を衣装と店内の色彩へ。'),
((SELECT id FROM series WHERE slug='autumn-cafe-collection'),'tuesday','焼き芋ブリュレ','2026-10-06',2,'焼き芋の紫とキャラメリゼの琥珀色を主役に。'),
((SELECT id FROM series WHERE slug='autumn-cafe-collection'),'wednesday','葡萄パフェ','2026-10-07',3,'葡萄の紫とガラスの透明感をカフェ空間へ。'),
((SELECT id FROM series WHERE slug='autumn-cafe-collection'),'thursday','パンプキンラテ','2026-10-08',4,'かぼちゃの橙とラテの温かさを衣装と光へ。'),
((SELECT id FROM series WHERE slug='autumn-cafe-collection'),'friday','秋色コーヒースタンド','2026-10-09',5,'秋色の街角でコーヒースタンドの表情を描く。'),
((SELECT id FROM series WHERE slug='autumn-cafe-collection'),'recap','総集編','2026-10-10',6,'一週間の秋の味覚とカフェファッションを振り返る。');
